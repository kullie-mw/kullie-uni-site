const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config');

const courseDefinitions = require('../data/courses.json');
const stopWords = new Set([
    'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
    'between', 'can', 'could', 'did', 'does', 'for', 'from', 'have', 'help', 'into', 'its',
    'just', 'more', 'most', 'not', 'please', 'should', 'some', 'such', 'than', 'that', 'the',
    'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under',
    'use', 'using', 'was', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'
]);
let courseIndexPromise;

function tokenize(value) {
    return (value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])
        .filter(token => !stopWords.has(token));
}

function sectionTitle(markdown, fallback) {
    const heading = markdown.match(/^#{1,4}\s+(.+)$/m);
    return heading ? heading[1].trim() : fallback;
}

function splitIntoChunks(markdown, unitTitle) {
    const sections = markdown
        .replace(/\r\n/g, '\n')
        .split(/(?=^#{1,4}\s)/m)
        .map(section => section.trim())
        .filter(Boolean);
    const chunks = [];

    for (const section of sections) {
        const title = sectionTitle(section, unitTitle);
        const paragraphs = section.split(/\n{2,}/);
        let current = '';
        for (const paragraph of paragraphs) {
            if (current && current.length + paragraph.length + 2 > 5000) {
                chunks.push({ unitTitle, title, text: current.trim() });
                current = '';
            }
            current += `${current ? '\n\n' : ''}${paragraph}`;
        }
        if (current.trim()) chunks.push({ unitTitle, title, text: current.trim() });
    }

    return chunks;
}

async function loadMarkdown(unit) {
    if (!/^[a-z0-9-]+\.js$/.test(unit.file)) {
        throw new Error(`Course material path is not allowed: ${unit.file}`);
    }
    let source;
    if (process.env.NETLIFY === 'true') {
        if (!process.env.URL) throw new Error('The Netlify site URL is not configured for course material retrieval.');
        const siteUrl = new URL(process.env.URL);
        const response = await fetch(new URL(unit.file, `${siteUrl.origin}/`));
        if (!response.ok) throw new Error(`Unable to load course material ${unit.file} from the deployed site.`);
        source = await response.text();
    } else {
        const filePath = path.resolve(config.projectRoot, unit.file);
        if (path.dirname(filePath) !== config.projectRoot) {
            throw new Error(`Course material path is not allowed: ${unit.file}`);
        }
        source = await fs.readFile(filePath, 'utf8');
    }
    source = source.replace(/^\uFEFF/, '');
    const assignment = source.match(/^window\.([A-Za-z0-9_$]+)\s*=\s*([\s\S]*);\s*$/);
    if (!assignment || assignment[1] !== unit.variable) {
        throw new Error(`Course material ${unit.file} does not match its configured variable.`);
    }

    const expression = assignment[2].trim();
    if (expression.startsWith('[')) {
        const joinIndex = expression.lastIndexOf('].join(');
        if (joinIndex === -1 || expression.slice(joinIndex) !== '].join("\\n")') {
            throw new Error(`Course material ${unit.file} has an unsupported text format.`);
        }
        const lines = JSON.parse(`[${expression.slice(1, joinIndex)}]`);
        if (!Array.isArray(lines) || lines.some(line => typeof line !== 'string')) {
            throw new Error(`Course material ${unit.file} does not contain valid text lines.`);
        }
        return lines.join('\n');
    }

    const markdown = JSON.parse(expression);
    if (typeof markdown !== 'string') {
        throw new Error(`Course material ${unit.file} does not contain text.`);
    }
    return markdown;
}

async function buildCourseIndex() {
    return Promise.all(courseDefinitions.map(async course => {
        const units = await Promise.all(course.units.map(async unit => ({
            ...unit,
            markdown: await loadMarkdown(unit)
        })));
        return {
            ...course,
            units,
            chunks: units.flatMap(unit => splitIntoChunks(unit.markdown, unit.title))
        };
    }));
}

function getCourseIndex() {
    if (!courseIndexPromise) courseIndexPromise = buildCourseIndex();
    return courseIndexPromise;
}

function scoreChunk(chunk, queryTokens, documentFrequency, totalChunks) {
    const titleTokens = new Set(tokenize(`${chunk.unitTitle} ${chunk.title}`));
    const textTokens = tokenize(chunk.text);
    const termFrequency = new Map();
    for (const token of textTokens) termFrequency.set(token, (termFrequency.get(token) || 0) + 1);

    let score = 0;
    let matchedTerms = 0;
    for (const token of queryTokens) {
        const frequency = termFrequency.get(token) || 0;
        const inTitle = titleTokens.has(token);
        if (frequency || inTitle) matchedTerms++;
        if (!frequency && !inTitle) continue;
        const inverseDocumentFrequency = Math.log(1 + totalChunks / (1 + (documentFrequency.get(token) || 0)));
        score += inverseDocumentFrequency * ((inTitle ? 5 : 0) + Math.min(frequency, 4));
    }

    return score + matchedTerms / Math.max(queryTokens.length, 1);
}

async function getCourseList() {
    return courseDefinitions.map(({ id, code, name, units }) => ({
        id,
        code,
        name,
        materialsAvailable: units.length > 0,
        unitCount: units.length
    }));
}

async function retrieveRelevantMaterials(courseId, query) {
    if (courseId === 'general') return { available: false, excerpts: [], sources: [] };
    const courses = await getCourseIndex();
    const course = courses.find(item => item.id === courseId);
    if (!course) throw new Error('The selected course is not available.');
    if (!course.chunks.length) return { available: false, excerpts: [], sources: [] };

    const queryTokens = [...new Set(tokenize(query))];
    if (!queryTokens.length) return { available: true, excerpts: [], sources: [] };

    const documentFrequency = new Map();
    for (const chunk of course.chunks) {
        const terms = new Set(tokenize(`${chunk.unitTitle} ${chunk.title} ${chunk.text}`));
        for (const term of queryTokens) {
            if (terms.has(term)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        }
    }

    const ranked = course.chunks
        .map(chunk => ({ chunk, score: scoreChunk(chunk, queryTokens, documentFrequency, course.chunks.length) }))
        .filter(result => result.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 4);
    const excerpts = [];
    let totalCharacters = 0;
    for (const { chunk } of ranked) {
        const remaining = config.maximumKnowledgeCharacters - totalCharacters;
        if (remaining <= 0) break;
        const text = chunk.text.slice(0, remaining);
        excerpts.push({ unit: chunk.unitTitle, heading: chunk.title, text });
        totalCharacters += text.length;
    }
    const sources = excerpts.map(excerpt => ({ unit: excerpt.unit, heading: excerpt.heading }));
    return { available: true, excerpts, sources };
}

module.exports = { getCourseList, retrieveRelevantMaterials };
