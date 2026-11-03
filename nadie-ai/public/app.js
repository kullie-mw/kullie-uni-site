(() => {
    const storageKey = 'kullie-nadie-ai-conversations-v1';
    const themeKey = 'kullie-nadie-ai-theme-v1';
    const maximumSavedConversations = 40;
    const maximumSavedMessages = 100;
    const modes = new Set(['learn', 'revision', 'practice', 'exam', 'steps', 'general']);
    const shell = document.getElementById('nadieShell');
    const elements = {
        history: document.getElementById('nadieHistory'),
        conversation: document.getElementById('nadieConversation'),
        composer: document.getElementById('nadieComposer'),
        input: document.getElementById('nadieInput'),
        send: document.getElementById('nadieSend'),
        course: document.getElementById('nadieCourse'),
        mode: document.getElementById('nadieMode'),
        status: document.getElementById('nadieStatus'),
        theme: document.getElementById('nadieThemeButton'),
        sidebar: document.getElementById('nadieSidebar'),
        newChat: document.getElementById('nadieNewChat'),
        rename: document.getElementById('nadieRenameChat'),
        clear: document.getElementById('nadieClearChat')
    };

    let conversations = readConversations();
    let activeConversationId = conversations[0]?.id || createConversation(false).id;
    let isSending = false;
    let apiAvailable = false;

    function createId() {
        return globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function createConversation(persist = true) {
        const conversation = {
            id: createId(),
            title: 'New conversation',
            courseId: 'general',
            mode: 'learn',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: []
        };
        conversations.unshift(conversation);
        if (persist) saveConversations();
        return conversation;
    }

    function readConversations() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (!Array.isArray(value)) throw new Error('Saved NADIE AI conversations are not a list.');
            return value
                .filter(conversation =>
                    conversation && typeof conversation.id === 'string' &&
                    typeof conversation.title === 'string' && Array.isArray(conversation.messages)
                )
                .slice(0, maximumSavedConversations);
        } catch (error) {
            console.error('Unable to read NADIE AI conversations from this browser.', error);
            return [];
        }
    }

    function saveConversations() {
        conversations = conversations.slice(0, maximumSavedConversations);
        for (const conversation of conversations) {
            conversation.messages = conversation.messages.slice(-maximumSavedMessages);
        }
        try {
            localStorage.setItem(storageKey, JSON.stringify(conversations));
        } catch (error) {
            console.error('Unable to save NADIE AI conversations in this browser.', error);
            setStatus('This conversation could not be saved in browser storage.', true);
        }
    }

    function activeConversation() {
        return conversations.find(conversation => conversation.id === activeConversationId);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderInline(value) {
        return escapeHtml(value)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }

    function renderMarkdownBlock(text) {
        const lines = text.split(/\r?\n/);
        const output = [];
        let paragraph = [];
        let list = [];
        let listTag = '';
        let table = [];

        const flushParagraph = () => {
            if (paragraph.length) output.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
            paragraph = [];
        };
        const flushList = () => {
            if (list.length) output.push(`<${listTag}>${list.map(item => `<li>${renderInline(item)}</li>`).join('')}</${listTag}>`);
            list = [];
            listTag = '';
        };
        const flushTable = () => {
            if (!table.length) return;
            const rows = table.filter(line => !/^\|\s*:?-{3,}/.test(line))
                .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
            if (rows.length) {
                const [header, ...body] = rows;
                output.push(`<div class="nadie-table-wrap"><table><thead><tr>${header.map(cell => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
            }
            table = [];
        };
        const flush = () => {
            flushParagraph();
            flushList();
            flushTable();
        };

        for (const line of lines) {
            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            const unordered = line.match(/^\s*[-*]\s+(.+)$/);
            const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
            if (heading) {
                flush();
                const level = Math.min(heading[1].length, 3);
                output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            } else if (/^\s*\|.*\|\s*$/.test(line)) {
                flushParagraph();
                flushList();
                table.push(line.trim());
            } else if (unordered || ordered) {
                flushParagraph();
                flushTable();
                const nextTag = ordered ? 'ol' : 'ul';
                if (listTag && listTag !== nextTag) flushList();
                listTag = nextTag;
                list.push((unordered || ordered)[1]);
            } else if (/^\s*>\s?/.test(line)) {
                flush();
                output.push(`<blockquote>${renderInline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
            } else if (!line.trim()) {
                flush();
            } else {
                flushList();
                flushTable();
                paragraph.push(line.trim());
            }
        }
        flush();
        return output.join('');
    }

    function renderMessageContent(content) {
        const parts = String(content).split(/```/);
        return parts.map((part, index) => {
            if (index % 2 === 1) {
                const newline = part.indexOf('\n');
                const code = newline < 0 ? part : part.slice(newline + 1);
                return `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`;
            }
            return renderMarkdownBlock(part);
        }).join('');
    }

    function formatTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function setStatus(message, isError = false) {
        elements.status.textContent = message;
        elements.status.classList.toggle('error', isError);
        elements.status.setAttribute('role', isError ? 'alert' : 'status');
    }

    function backendHelpMessage() {
        if (window.location.protocol === 'file:') {
            return 'NADIE AI cannot fetch from a file:// page. In PowerShell run: Set-Location C:\\mynotes\\nadie-ai; npm start. Then open http://127.0.0.1:3000. AI replies also require a provider API key in nadie-ai/.env.';
        }
        if (window.location.hostname.endsWith('.netlify.app')) {
            return 'Cannot reach the NADIE AI function. Check the latest Netlify deploy and confirm GROQ_API_KEY is set under Site configuration → Environment variables, then redeploy.';
        }
        return 'Cannot reach the NADIE AI backend. In PowerShell run: Set-Location C:\\mynotes\\nadie-ai; npm start, then open or reload http://127.0.0.1:3000. AI replies also require a provider API key in nadie-ai/.env.';
    }

    function updateSendState() {
        elements.send.disabled = isSending || !elements.input.value.trim();
        elements.send.textContent = isSending ? 'Working…' : 'Send';
    }

    function scrollConversationToBottom() {
        elements.conversation.scrollTop = elements.conversation.scrollHeight;
    }

    function renderMessages() {
        const conversation = activeConversation();
        if (!conversation || conversation.messages.length === 0) {
            elements.conversation.innerHTML = `
                <div class="nadie-welcome">
                    <span class="nadie-welcome-badge">✦ NADIE AI</span>
                    <h2>Your Personal University AI Tutor</h2>
                    <p>Learn. Understand. Practise. Excel. Ask about your course notes, work through a problem step by step, or start a revision session.</p>
                    <div class="nadie-prompt-grid">
                        <button class="nadie-prompt" type="button" data-prompt="Explain a difficult concept from my selected course in simple steps.">Explain a course concept</button>
                        <button class="nadie-prompt" type="button" data-prompt="Give me a worked example for a topic in my selected course.">Show a worked example</button>
                        <button class="nadie-prompt" type="button" data-prompt="Quiz me on the main ideas in the selected course and explain my mistakes.">Practise with questions</button>
                        <button class="nadie-prompt" type="button" data-prompt="Help me solve this problem step by step: ">Solve a problem step by step</button>
                    </div>
                </div>
            `;
            return;
        }

        elements.conversation.innerHTML = conversation.messages.map((message, index) => {
            const isUser = message.role === 'user';
            const author = isUser ? 'You' : 'NADIE AI';
            const content = message.pending
                ? 'Thinking it through <span class="nadie-dots" aria-label="AI is responding"><i></i><i></i><i></i></span>'
                : renderMessageContent(message.content);
            const sources = Array.isArray(message.sources) && message.sources.length
                ? `<div class="nadie-sources"><strong>Course notes consulted</strong><ul>${message.sources.map(source => `<li>${escapeHtml(source.unit)} · ${escapeHtml(source.heading)}</li>`).join('')}</ul></div>`
                : (!isUser && message.courseId && message.courseMaterialsAvailable
                    ? '<div class="nadie-sources">No relevant excerpts were retrieved from the selected course notes.</div>'
                    : (!isUser && message.courseId
                        ? '<div class="nadie-sources">No official notes are currently available for the selected course; this answer uses general knowledge.</div>'
                        : ''));
            return `
                <article class="nadie-message ${isUser ? 'user' : 'assistant'}${message.pending ? ' pending' : ''}">
                    <div class="nadie-message-header">
                        <span><strong>${author}</strong> · ${formatTime(message.createdAt)}</span>
                        ${isUser || message.pending ? '' : `<span class="nadie-message-actions"><button type="button" data-copy-message="${index}" aria-label="Copy response">Copy</button></span>`}
                    </div>
                    <div class="nadie-message-body">${message.pending ? content : renderMessageContent(message.content)}</div>
                    ${sources}
                </article>
            `;
        }).join('');
        scrollConversationToBottom();
    }

    function renderHistory() {
        const visibleConversations = conversations.filter(conversation => conversation.messages.some(message => !message.pending));
        if (!visibleConversations.length) {
            elements.history.innerHTML = '<div class="nadie-history-empty">Your saved conversations will appear here.</div>';
            return;
        }
        elements.history.innerHTML = visibleConversations.map(conversation => `
            <div class="nadie-history-row ${conversation.id === activeConversationId ? 'active' : ''}">
                <button class="nadie-history-open" type="button" data-open-chat="${escapeHtml(conversation.id)}" title="${escapeHtml(conversation.title)}">${escapeHtml(conversation.title)}</button>
                <button class="nadie-history-action" type="button" data-rename-chat="${escapeHtml(conversation.id)}" aria-label="Rename ${escapeHtml(conversation.title)}" title="Rename">✎</button>
                <button class="nadie-history-action" type="button" data-delete-chat="${escapeHtml(conversation.id)}" aria-label="Delete ${escapeHtml(conversation.title)}" title="Delete">×</button>
            </div>
        `).join('');
    }

    function render() {
        renderHistory();
        renderMessages();
        updateSendState();
    }

    function persistConversation() {
        const conversation = activeConversation();
        if (!conversation) return;
        conversation.courseId = elements.course.value;
        conversation.mode = elements.mode.value;
        conversation.updatedAt = new Date().toISOString();
        saveConversations();
        renderHistory();
    }

    async function sendMessage(rawText) {
        const content = rawText.trim();
        if (!content || isSending) return;
        if (window.location.protocol === 'file:') {
            setStatus(backendHelpMessage(), true);
            return;
        }
        if (content.length > 8000) {
            setStatus('Keep each message under 8,000 characters.', true);
            return;
        }
        let conversation = activeConversation();
        if (!conversation) {
            conversation = createConversation();
            activeConversationId = conversation.id;
        }

        const courseId = elements.course.value;
        const mode = elements.mode.value;
        conversation.courseId = courseId;
        conversation.mode = mode;
        conversation.messages.push({ role: 'user', content, createdAt: new Date().toISOString() });
        if (conversation.title === 'New conversation') {
            conversation.title = content.replace(/\s+/g, ' ').slice(0, 55) || 'New conversation';
        }
        const pending = { role: 'assistant', content: '', pending: true, createdAt: new Date().toISOString() };
        conversation.messages.push(pending);
        saveConversations();
        isSending = true;
        elements.input.value = '';
        updateSendState();
        render();
        setStatus('NADIE AI is preparing a response…');

        try {
            const messages = conversation.messages
                .filter(message => !message.pending)
                .slice(-12)
                .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages, courseId, mode })
            });
            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error('The server returned an unreadable response. Check that the NADIE AI backend is running.');
            }
            if (!response.ok) throw new Error(result.error || `The AI request failed (${response.status}).`);
            pending.pending = false;
            pending.content = result.answer;
            pending.sources = Array.isArray(result.sources) ? result.sources : [];
            pending.courseId = courseId === 'general' ? '' : courseId;
            pending.courseMaterialsAvailable = Boolean(result.courseMaterialsAvailable);
            pending.model = result.model;
            pending.completedAt = new Date().toISOString();
            apiAvailable = true;
            setStatus(`Connected to NADIE AI · ${result.provider} · ${result.model}`);
        } catch (error) {
            console.error('NADIE AI chat request failed.', error);
            conversation.messages = conversation.messages.filter(message => message !== pending);
            setStatus(error instanceof TypeError ? backendHelpMessage() : (error.message || 'NADIE AI could not respond. Please try again.'), true);
        } finally {
            isSending = false;
            conversation.updatedAt = new Date().toISOString();
            saveConversations();
            if (activeConversationId === conversation.id) render();
            else renderHistory();
            updateSendState();
        }
    }

    async function checkServer() {
        if (window.location.protocol === 'file:') {
            apiAvailable = false;
            setStatus(backendHelpMessage(), true);
            return;
        }
        try {
            const response = await fetch('/api/health');
            if (!response.ok) throw new Error('The tutor server is not available.');
            const health = await response.json();
            apiAvailable = Boolean(health.aiConfigured);
            if (!health.aiConfigured) {
                setStatus('Backend is running. Add an OpenAI or Groq API key to nadie-ai/.env to enable AI responses.', true);
            } else {
                setStatus(`Connected to NADIE AI · ${health.provider} · ${health.model}`);
            }
        } catch {
            apiAvailable = false;
            setStatus(backendHelpMessage(), true);
        }
    }

    async function loadCourses() {
        if (window.location.protocol === 'file:') return;
        try {
            const response = await fetch('/api/courses');
            if (!response.ok) throw new Error('The available courses could not be loaded.');
            const result = await response.json();
            for (const course of result.courses) {
                const option = document.createElement('option');
                option.value = course.id;
                option.textContent = `${course.code} · ${course.name}${course.materialsAvailable ? '' : ' (no notes yet)'}`;
                elements.course.appendChild(option);
            }
            const conversation = activeConversation();
            if (conversation?.courseId && [...elements.course.options].some(option => option.value === conversation.courseId)) {
                elements.course.value = conversation.courseId;
            }
        } catch (error) {
            console.error('Unable to load NADIE AI courses.', error);
            setStatus('The course list could not be loaded. Restart the NADIE AI server and reload this page.', true);
        }
    }

    function applyTheme(theme) {
        const value = theme === 'dark' ? 'dark' : 'light';
        shell.dataset.theme = value;
        elements.theme.textContent = value === 'dark' ? '☀️' : '🌙';
        elements.theme.setAttribute('aria-label', value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        try {
            localStorage.setItem(themeKey, value);
        } catch (error) {
            console.error('Unable to save the NADIE AI theme preference.', error);
        }
    }

    elements.composer.addEventListener('submit', event => {
        event.preventDefault();
        sendMessage(elements.input.value);
    });

    elements.input.addEventListener('input', updateSendState);
    elements.input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            elements.composer.requestSubmit();
        }
    });

    elements.newChat.addEventListener('click', () => {
        const conversation = createConversation();
        activeConversationId = conversation.id;
        elements.course.value = 'general';
        elements.mode.value = 'learn';
        render();
        setStatus(apiAvailable ? 'Connected to NADIE AI' : 'Conversation saved in this browser.');
        elements.input.focus();
        shell.classList.remove('mobile-sidebar-open');
    });

    elements.history.addEventListener('click', event => {
        const openButton = event.target.closest('[data-open-chat]');
        if (openButton) {
            const conversation = conversations.find(item => item.id === openButton.dataset.openChat);
            if (!conversation) return;
            activeConversationId = conversation.id;
            if ([...elements.course.options].some(option => option.value === conversation.courseId)) {
                elements.course.value = conversation.courseId;
            }
            elements.mode.value = modes.has(conversation.mode) ? conversation.mode : 'learn';
            render();
            shell.classList.remove('mobile-sidebar-open');
            return;
        }

        const renameButton = event.target.closest('[data-rename-chat]');
        if (renameButton) {
            const conversation = conversations.find(item => item.id === renameButton.dataset.renameChat);
            if (!conversation) return;
            const title = window.prompt('Rename this conversation:', conversation.title);
            if (title === null) return;
            if (!title.trim()) {
                setStatus('Conversation titles cannot be empty.', true);
                return;
            }
            conversation.title = title.trim().slice(0, 80);
            saveConversations();
            renderHistory();
            return;
        }

        const deleteButton = event.target.closest('[data-delete-chat]');
        if (deleteButton) {
            const conversation = conversations.find(item => item.id === deleteButton.dataset.deleteChat);
            if (!conversation || !window.confirm(`Delete "${conversation.title}" from this browser?`)) return;
            conversations = conversations.filter(item => item.id !== conversation.id);
            if (activeConversationId === conversation.id) {
                const next = conversations[0] || createConversation(false);
                activeConversationId = next.id;
            }
            saveConversations();
            render();
        }
    });

    elements.conversation.addEventListener('click', event => {
        const promptButton = event.target.closest('[data-prompt]');
        if (promptButton) {
            elements.input.value = promptButton.dataset.prompt;
            elements.input.focus();
            updateSendState();
            return;
        }
        const copyButton = event.target.closest('[data-copy-message]');
        if (copyButton) {
            const message = activeConversation()?.messages[Number(copyButton.dataset.copyMessage)];
            if (!message) return;
            navigator.clipboard.writeText(message.content).then(
                () => setStatus('Response copied to clipboard.'),
                error => {
                    console.error('Unable to copy the NADIE AI response.', error);
                    setStatus('Could not access the clipboard. Select and copy the response instead.', true);
                }
            );
        }
    });

    elements.course.addEventListener('change', persistConversation);
    elements.mode.addEventListener('change', persistConversation);

    elements.rename.addEventListener('click', () => {
        const conversation = activeConversation();
        if (!conversation) return;
        const title = window.prompt('Rename this conversation:', conversation.title);
        if (title === null) return;
        if (!title.trim()) {
            setStatus('Conversation titles cannot be empty.', true);
            return;
        }
        conversation.title = title.trim().slice(0, 80);
        saveConversations();
        renderHistory();
    });

    elements.clear.addEventListener('click', () => {
        const conversation = activeConversation();
        if (!conversation || conversation.messages.length === 0) return;
        if (!window.confirm('Clear all messages in this conversation?')) return;
        conversation.messages = [];
        conversation.title = 'New conversation';
        conversation.updatedAt = new Date().toISOString();
        saveConversations();
        render();
    });

    elements.theme.addEventListener('click', () => {
        applyTheme(shell.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('nadieSidebarToggle').addEventListener('click', () => {
        if (window.matchMedia('(max-width: 760px)').matches) {
            shell.classList.toggle('mobile-sidebar-open');
        } else {
            shell.classList.toggle('nadie-sidebar-collapsed');
        }
    });

    document.getElementById('nadieSidebarClose').addEventListener('click', () => {
        shell.classList.remove('mobile-sidebar-open');
    });

    elements.course.addEventListener('change', () => {
        if (elements.course.value !== 'general') {
            const option = elements.course.selectedOptions[0];
            if (option?.textContent.includes('(no notes yet)')) {
                setStatus('No official course notes are available for this course yet. NADIE AI will label general explanations accordingly.');
            }
        }
    });

    const savedTheme = (() => {
        try {
            return localStorage.getItem(themeKey);
        } catch (error) {
            console.error('Unable to read the NADIE AI theme preference.', error);
            return 'light';
        }
    })();

    applyTheme(savedTheme);
    render();
    loadCourses();
    checkServer();
})();
