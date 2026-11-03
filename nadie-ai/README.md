# NADIE AI for Kullie Uni

NADIE AI is a local Node.js backend and browser-based study assistant integrated into the existing Kullie Uni HTML/CSS/JavaScript website. It supports OpenAI and Groq; provider keys are read only by the server.

## Requirements

- Node.js 20 or newer.
- An OpenAI or Groq API key with API access and available quota.

## Start locally

1. Open a terminal in the `nadie-ai` folder.
2. Install the backend dependencies:

   ```powershell
   npm install
   ```

3. Create a local environment file from the example:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Open `nadie-ai/.env` and add a key for your provider. Use `OPENAI_API_KEY` for OpenAI, or `GROQ_API_KEY` for Groq. If both are present, Groq is used. Keep this file private; it is excluded by the repository `.gitignore`.
5. Start the website and backend together:

   ```powershell
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000). Do not open `index.html` directly from a `file://` URL: the browser needs the local server for the chat API.

`OPENAI_MODEL` selects the model and defaults to `gpt-4.1-mini` for OpenAI or `llama-3.3-70b-versatile` for Groq. Set it to a model available to your provider and restart the server. For Groq, `GROQ_BASE_URL` defaults to `https://api.groq.com/openai/v1`. `PORT` and `HOST` can also be changed. The default host is `127.0.0.1`, which keeps the service available only on the local computer.

## Troubleshooting

- **“Failed to fetch” or the course list does not load:** Make sure the terminal running `npm start` is still open, then use `http://127.0.0.1:3000` (or `http://localhost:3000`). Do not use the `file:///.../index.html` address.
- **The backend loads but chat says an API key is needed:** Add `OPENAI_API_KEY` or `GROQ_API_KEY` to `nadie-ai/.env`, save, and restart `npm start`.
- **The API key is rejected or the provider reports quota/rate limits:** Verify the key is for the selected provider and that its project has API access and available quota. ChatGPT subscriptions and OpenAI API billing are managed separately.

## Included features

- Learn, Revision, Practice, Exam, Step-by-step, and General modes.
- Course selection for STA111, ASC111, DIS113/COM111, MAT111, and LAN112.
- Search-based retrieval of a few relevant sections from the existing STA111, ASC111, and DIS113/COM111 notes. New note files can be registered in `data/courses.json`.
- Honest indication when a selected course has no supplied notes or no relevant excerpt was found.
- Local conversation history, rename/delete/clear controls, copy response, timestamps, and a light/dark theme.
- Request validation, 30 chat requests per IP per 15 minutes, request size limits, and backend error handling.

Conversations are stored in the browser's local storage, not on the server. Clear browser storage to remove saved chats. The server does not keep a chat database.

## Deploy to Netlify

The site includes a Netlify Function for `/api/health`, `/api/courses`, and `/api/chat`. Connect the repository to Netlify with the repository root as the site base directory; `netlify.toml` configures the publish directory, function routes, and dependency installation.

In the Netlify site's environment variables, add `GROQ_API_KEY` with your provider key. Do not put the key in GitHub, source files, or a `NEXT_PUBLIC_*`/browser variable. `OPENAI_API_KEY` can be used instead; when both provider keys are set, Groq is selected. Optionally set `OPENAI_MODEL` or `GROQ_BASE_URL` as needed. Redeploy after changing environment variables.

The hosted function loads course notes from the deployed site and uses them for relevant answers. The chat endpoint allows unauthenticated public visitors, so provider usage and any associated charges count against your account. The function applies a per-instance request limit; Netlify may run multiple function instances, so this is not a global abuse-prevention or spending cap. Monitor provider usage and configure provider-side limits.

## Local development and API costs

Opening `index.html` directly with a `file://` URL cannot reach the API. For local development, create `nadie-ai/.env` with a provider key, run `npm start` in `nadie-ai`, and open `http://127.0.0.1:3000`. The local Express backend binds to `127.0.0.1` and is intended for development. GitHub Pages cannot run the backend; use the Netlify Function setup above for the hosted site. AI-provider usage may consume quota or incur charges.
