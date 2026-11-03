const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const { getCourseList, retrieveRelevantMaterials } = require('./services/knowledgeService');
const { generateResponse } = require('./services/aiService');

const app = express();
const privatePathPattern = /^\/nadie-ai\/(?!(?:public)(?:\/|$))/i;
const allowedModes = new Set(['learn', 'revision', 'practice', 'exam', 'steps', 'general']);

app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use((request, response, next) => {
    let normalizedPath;
    try {
        normalizedPath = path.posix.normalize(decodeURIComponent(request.path).replace(/\\/g, '/'));
    } catch {
        response.sendStatus(400);
        return;
    }
    if (privatePathPattern.test(normalizedPath)) {
        response.sendStatus(404);
        return;
    }
    next();
});
app.use(express.json({ limit: '20kb', strict: true }));

const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'You have sent several messages recently. Please wait a few minutes and try again.' }
});

app.get('/api/health', (request, response) => {
    response.json({
        status: 'ok',
        aiConfigured: Boolean(config.aiApiKey),
        provider: config.aiProviderName,
        model: config.aiModel
    });
});

app.get('/api/courses', async (request, response, next) => {
    try {
        response.json({ courses: await getCourseList() });
    } catch (error) {
        next(error);
    }
});

app.post('/api/chat', chatLimiter, async (request, response, next) => {
    try {
        const { messages, courseId = 'general', mode = 'learn' } = request.body || {};
        if (!Array.isArray(messages) || messages.length === 0 || messages.length > config.maximumConversationMessages) {
            response.status(400).json({ error: `Send between 1 and ${config.maximumConversationMessages} recent messages.` });
            return;
        }
        if (!allowedModes.has(mode)) {
            response.status(400).json({ error: 'Choose one of the available study modes.' });
            return;
        }
        if (typeof courseId !== 'string' || !/^(general|sta111|asc111|dis113|mat111|lan112)$/.test(courseId)) {
            response.status(400).json({ error: 'Choose one of the available courses.' });
            return;
        }

        let totalCharacters = 0;
        const validatedMessages = [];
        for (const message of messages) {
            if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
                response.status(400).json({ error: 'Each message needs a valid role and non-empty text.' });
                return;
            }
            if (message.content.length > config.maximumMessageCharacters) {
                response.status(400).json({ error: `Each message must be ${config.maximumMessageCharacters} characters or fewer.` });
                return;
            }
            totalCharacters += message.content.length;
            validatedMessages.push({ role: message.role, content: message.content.trim() });
        }
        if (totalCharacters > config.maximumRequestCharacters) {
            response.status(400).json({ error: 'This conversation is too long to send at once. Start a new chat or shorten your message.' });
            return;
        }
        if (validatedMessages[validatedMessages.length - 1].role !== 'user') {
            response.status(400).json({ error: 'The most recent message must be from you.' });
            return;
        }

        const courses = await getCourseList();
        const course = courseId === 'general' ? null : courses.find(item => item.id === courseId);
        if (courseId !== 'general' && !course) {
            response.status(400).json({ error: 'The selected course is not available.' });
            return;
        }
        const latestQuestion = validatedMessages[validatedMessages.length - 1].content;
        const knowledge = await retrieveRelevantMaterials(courseId, latestQuestion);
        const answer = await generateResponse({ messages: validatedMessages, course, mode, knowledge });
        response.json({
            answer,
            sources: knowledge.sources,
            courseMaterialsAvailable: knowledge.available,
            provider: config.aiProviderName,
            model: config.aiModel
        });
    } catch (error) {
        if (error.status === 503 && error.code === 'api_key_missing') {
            response.status(503).json({ error: error.message });
            return;
        }
        if (error.status === 401) {
            response.status(502).json({ error: `The ${config.aiProviderName} API key was rejected. Check the ${config.aiProvider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'} value in nadie-ai/.env.` });
            return;
        }
        if (error.status === 429) {
            response.status(503).json({ error: `${config.aiProviderName} is rate-limited or the project has reached its API quota. Check your ${config.aiProviderName} project and try again later.` });
            return;
        }
        if (error.status === 400 || error.status === 404) {
            response.status(502).json({ error: `The selected model or request is not supported by ${config.aiProviderName}. Check OPENAI_MODEL in nadie-ai/.env.` });
            return;
        }
        if (error.name === 'APIConnectionTimeoutError' || error.name === 'APIConnectionError') {
            response.status(503).json({ error: 'NADIE AI could not reach the AI service. Check your connection and try again.' });
            return;
        }
        next(error);
    }
});

app.use(express.static(config.projectRoot, {
    dotfiles: 'deny',
    index: 'index.html',
    fallthrough: true
}));

app.use((error, request, response, next) => {
    if (response.headersSent) {
        next(error);
        return;
    }
    if (error.type === 'entity.parse.failed') {
        response.status(400).json({ error: 'The request body must be valid JSON.' });
        return;
    }
    if (error.type === 'entity.too.large') {
        response.status(413).json({ error: 'The request is too large.' });
        return;
    }
    console.error('NADIE AI request failed.', { name: error.name, status: error.status });
    response.status(500).json({ error: 'NADIE AI could not complete that request. Please try again.' });
});

async function startServer() {
    await getCourseList();
    app.listen(config.port, config.host, () => {
        console.log(`NADIE AI is running at http://${config.host}:${config.port}`);
        console.log(`NADIE AI is using ${config.aiProviderName} model ${config.aiModel}.`);
        if (!config.aiApiKey) {
            console.warn('No AI API key is configured. Add OPENAI_API_KEY or GROQ_API_KEY to nadie-ai/.env to enable AI responses.');
        }
    });
}

if (require.main === module) {
    startServer().catch(error => {
        console.error('NADIE AI could not start.', { name: error.name, message: error.message });
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };
