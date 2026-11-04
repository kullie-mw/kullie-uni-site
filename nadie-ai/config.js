const path = require('node:path');

// __dirname is unavailable when this module is bundled into an ES module
// (e.g. a Netlify Function), so fall back to the working directory there.
const moduleDirectory = typeof __dirname === 'string' ? __dirname : path.join(process.cwd(), 'nadie-ai');

require('dotenv').config({ path: path.join(moduleDirectory, '.env') });

const groqApiKey = process.env.GROQ_API_KEY || '';
const useGroq = Boolean(groqApiKey);

module.exports = {
    host: process.env.HOST || '127.0.0.1',
    port: Number.parseInt(process.env.PORT || '3000', 10),
    aiProvider: useGroq ? 'groq' : 'openai',
    aiProviderName: useGroq ? 'Groq' : 'OpenAI',
    aiApiKey: useGroq ? groqApiKey : (process.env.OPENAI_API_KEY || ''),
    aiBaseURL: useGroq
        ? (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1')
        : undefined,
    aiModel: process.env.OPENAI_MODEL || (useGroq ? 'llama-3.3-70b-versatile' : 'gpt-4.1-mini'),
    projectRoot: path.resolve(moduleDirectory, '..'),
    maximumRequestCharacters: 12000,
    maximumMessageCharacters: 8000,
    maximumConversationMessages: 12,
    maximumKnowledgeCharacters: 12000
};
