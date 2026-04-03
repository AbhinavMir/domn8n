# domn8n

AI-powered DOM mapper that generates standalone Playwright automation scripts.

Give it a URL and a goal. It opens a browser, uses Claude to figure out each page, fills forms, clicks buttons, and when it's done — spits out a standalone Playwright TypeScript script you can run without domn8n.

## Install

```bash
npm install -g domn8n
```

You'll also need Playwright's browsers:

```bash
npx playwright install chromium
```

## Usage

```bash
domn8n --url "https://example.com" --goal "Log in and navigate to billing"
```

On first run, it will ask for your Claude API key (saved to `~/.domn8n/keys/`).

### What happens

1. Opens a visible Chromium window
2. Claude interprets each page and decides what to do next
3. Prompts you in the terminal when it needs input (credentials, form values, CAPTCHAs)
4. Retries up to 3 times per step if something fails
5. Saves a standalone Playwright `.ts` script to `~/.domn8n/scripts/`

### Output

The generated script is a plain Playwright TypeScript file with zero dependency on domn8n. Sensitive values (passwords) are read from environment variables:

```bash
DOMN8N_PASSWORD=secret npx tsx ~/.domn8n/scripts/example-com-login.ts
```

## Security

- Passwords and secrets are **never** sent to the AI — only field labels and types
- Sensitive inputs are prompted with hidden input in the terminal
- Generated scripts read credentials from env vars, never hardcoded
- API key stored with `0600` permissions

## How it works

Three layers:

- **Explorer** — Extracts a simplified DOM snapshot (interactive elements, forms, links) and captures network calls
- **Pilot** — Sends the snapshot to Claude, which returns the next action as structured JSON
- **Recorder** — Logs every action and generates a standalone Playwright script at the end

## Development

```bash
git clone https://github.com/AbhinavMir/domn8n
cd domn8n
bun install
bun run src/cli.ts --url "https://example.com" --goal "your goal"
```

## License

MIT
