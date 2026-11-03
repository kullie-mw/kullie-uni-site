# Kullie Uni

Kullie Uni is a study hub for Bachelor of Science students in Statistics and Actuarial Science, with course notes, quizzes, progress tracking, and NADIE AI. The site is still under development.

Visitors can leave a private experience review and improvement suggestions through Netlify Forms. Submissions are available to the site developer in the Netlify dashboard. For submissions to work, deploy the latest site to Netlify and enable Forms for that site; local `file://` previews cannot submit feedback.

## Deploy on Netlify

1. Connect the `kullie-mw/kullie-uni` GitHub repository to Netlify and use the repository root as the site base directory.
2. In Netlify, add `GROQ_API_KEY` under the site's environment variables. Keep provider keys out of GitHub and browser code. You can use `OPENAI_API_KEY` instead; if both are configured, Groq is used.
3. Deploy the site. `netlify.toml` configures the static site, serverless API routes, and function dependencies.

The public chat uses the configured provider account and may consume its quota or incur charges. The function's rate limit is per running instance, not a global spending cap; monitor usage with the provider.

See [nadie-ai/README.md](./nadie-ai/README.md) for local setup, API configuration, and troubleshooting.
