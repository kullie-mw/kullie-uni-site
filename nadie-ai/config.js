const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// Read provider settings lazily so keys injected at runtime (for example by
// Netlify AI Gateway, which sets OPENAI_API_KEY and OPENAI_BASE_URL) are picked up.
function useGroq() {
    return Boolean(process.env.GROQ_API_KEY);
}

module.exports = {
    host: process.env.HOST || '127.0.0.1',
    port: Number.parseInt(process.env.PORT || '3000', 10),
    get aiProvider() {
        return useGroq() ? 'groq' : 'openai';
    },
    get aiProviderName() {
        return useGroq() ? 'Groq' : 'OpenAI';
    },
    get aiApiKey() {
        return useGroq() ? process.env.GROQ_API_KEY : (process.env.OPENAI_API_KEY || '');
    },
    get aiBaseURL() {
        return useGroq()
            ? (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1')
            : (process.env.OPENAI_BASE_URL || undefined);
    },
    get aiModel() {
        return process.env.OPENAI_MODEL || (useGroq() ? 'llama-3.3-70b-versatile' : 'gpt-4.1-mini');
    },
    projectRoot: path.resolve(__dirname, '..'),
    maximumRequestCharacters: 12000,
    maximumMessageCharacters: 8000,
    maximumConversationMessages: 12,
    maximumKnowledgeCharacters: 12000
};
