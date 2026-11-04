import nadieConfig from '../../nadie-ai/config.js';
import knowledgeService from '../../nadie-ai/services/knowledgeService.js';
import aiService from '../../nadie-ai/services/aiService.js';

const { getCourseList, retrieveRelevantMaterials } = knowledgeService;
const { generateResponse } = aiService;

const allowedModes = new Set(['learn', 'revision', 'practice', 'exam', 'steps', 'general']);
const maximumRequestBytes = 20 * 1024;
const rateLimitWindowMs = 15 * 60 * 1000;
const rateLimitMaximum = 30;
const rateLimitBuckets = new Map();

function jsonResponse(statusCode, payload) {
    return new Response(JSON.stringify(payload), {
        status: statusCode,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function isRateLimited(ipAddress) {
    const now = Date.now();
    let bucket = rateLimitBuckets.get(ipAddress);
    if (!bucket || now - bucket.startedAt >= rateLimitWindowMs) {
        bucket = { startedAt: now, count: 0 };
        rateLimitBuckets.set(ipAddress, bucket);
    }
    bucket.count++;

    if (rateLimitBuckets.size > 10000) {
        for (const [address, entry] of rateLimitBuckets) {
            if (now - entry.startedAt >= rateLimitWindowMs) rateLimitBuckets.delete(address);
        }
    }
    return bucket.count > rateLimitMaximum;
}

function errorResponse(error) {
    if (error.status === 503 && error.code === 'api_key_missing') {
        return jsonResponse(503, { error: error.message });
    }
    if (error.status === 401) {
        const keyName = nadieConfig.aiProvider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY';
        return jsonResponse(502, { error: `The ${nadieConfig.aiProviderName} API key was rejected. Check the ${keyName} environment variable in Netlify.` });
    }
    if (error.status === 429) {
        return jsonResponse(503, { error: `${nadieConfig.aiProviderName} is rate-limited or the project has reached its API quota. Check your ${nadieConfig.aiProviderName} project and try again later.` });
    }
    if (error.status === 400 || error.status === 404) {
        return jsonResponse(502, { error: `The selected model or request is not supported by ${nadieConfig.aiProviderName}. Check the OPENAI_MODEL environment variable in Netlify.` });
    }
    if (error.name === 'APIConnectionTimeoutError' || error.name === 'APIConnectionError') {
        return jsonResponse(503, { error: 'NADIE AI could not reach the AI service. Check the provider status and try again.' });
    }

    console.error('NADIE AI function request failed.', { name: error.name, status: error.status });
    return jsonResponse(500, { error: 'NADIE AI could not complete that request. Please try again.' });
}

async function handleChat(req, context) {
    const ipAddress = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
    if (isRateLimited(ipAddress)) {
        return jsonResponse(429, { error: 'You have sent several messages recently. Please wait a few minutes and try again.' });
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > maximumRequestBytes) {
        return jsonResponse(413, { error: 'The request is too large.' });
    }

    let body;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return jsonResponse(400, { error: 'The request body must be valid JSON.' });
    }

    const { messages, courseId = 'general', mode = 'learn' } = body || {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > nadieConfig.maximumConversationMessages) {
        return jsonResponse(400, { error: `Send between 1 and ${nadieConfig.maximumConversationMessages} recent messages.` });
    }
    if (!allowedModes.has(mode)) {
        return jsonResponse(400, { error: 'Choose one of the available study modes.' });
    }
    if (typeof courseId !== 'string' || !/^(general|sta111|asc111|dis113|mat111|lan112)$/.test(courseId)) {
        return jsonResponse(400, { error: 'Choose one of the available courses.' });
    }

    let totalCharacters = 0;
    const validatedMessages = [];
    for (const message of messages) {
        if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
            return jsonResponse(400, { error: 'Each message needs a valid role and non-empty text.' });
        }
        if (message.content.length > nadieConfig.maximumMessageCharacters) {
            return jsonResponse(400, { error: `Each message must be ${nadieConfig.maximumMessageCharacters} characters or fewer.` });
        }
        totalCharacters += message.content.length;
        validatedMessages.push({ role: message.role, content: message.content.trim() });
    }
    if (totalCharacters > nadieConfig.maximumRequestCharacters) {
        return jsonResponse(400, { error: 'This conversation is too long to send at once. Start a new chat or shorten your message.' });
    }
    if (validatedMessages[validatedMessages.length - 1].role !== 'user') {
        return jsonResponse(400, { error: 'The most recent message must be from you.' });
    }

    const courses = await getCourseList();
    const course = courseId === 'general' ? null : courses.find(item => item.id === courseId);
    if (courseId !== 'general' && !course) {
        return jsonResponse(400, { error: 'The selected course is not available.' });
    }

    const knowledge = await retrieveRelevantMaterials(courseId, validatedMessages[validatedMessages.length - 1].content);
    const answer = await generateResponse({ messages: validatedMessages, course, mode, knowledge });
    return jsonResponse(200, {
        answer,
        sources: knowledge.sources,
        courseMaterialsAvailable: knowledge.available,
        provider: nadieConfig.aiProviderName,
        model: nadieConfig.aiModel
    });
}

export default async (req, context) => {
    try {
        const requestPath = new URL(req.url).pathname;
        if (requestPath.endsWith('/api/health') || requestPath.endsWith('/health')) {
            if (req.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
            return jsonResponse(200, {
                status: 'ok',
                aiConfigured: Boolean(nadieConfig.aiApiKey),
                provider: nadieConfig.aiProviderName,
                model: nadieConfig.aiModel
            });
        }
        if (requestPath.endsWith('/api/courses') || requestPath.endsWith('/courses')) {
            if (req.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
            return jsonResponse(200, { courses: await getCourseList() });
        }
        if (requestPath.endsWith('/api/chat') || requestPath.endsWith('/chat')) {
            if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });
            return await handleChat(req, context);
        }
        return jsonResponse(404, { error: 'Not found.' });
    } catch (error) {
        return errorResponse(error);
    }
};

export const config = {
    path: ['/api/health', '/api/courses', '/api/chat']
};
