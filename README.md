# Ryan Memory OS

Ryan Memory OS is a private, local-first browser workspace for remembering the relationship story accurately and exporting a clean Ryan Case Packet for an external model such as GPT, Claude, or Grok.

It stores a focused user profile, target containers, raw reports, reviewed extracted memory, timelines, risks, open loops, demo fixtures, and exports. It does not generate dating or relationship advice.

GitHub repository: [https://github.com/officemendante-art/Ryan-Memory-OS.git](https://github.com/officemendante-art/Ryan-Memory-OS.git)

## Phase 1 does

- Run as a React + TypeScript + Vite app at the repository root.
- Persist data locally with Dexie over IndexedDB.
- Provide focused User Profile and Target Container forms.
- Capture raw reports quickly.
- Extract deterministic local memory suggestions.
- Optionally use the AI Provider Manager for AI-assisted memory extraction with Gemini, OpenRouter, or a custom OpenAI-compatible endpoint.
- Require human review before saving extracted memory.
- Merge selected memory into a target timeline/container.
- Export Ryan Case Packets as Markdown or JSON.
- Export/import target JSON with validation before IndexedDB writes.
- Load and clear opt-in demo data without deleting real records.

## Phase 1 does NOT do

- No SaaS, login, auth, payments, analytics, or cloud sync.
- No WhatsApp, social-media, or external message integrations.
- No required paid API and no hidden remote AI call; AI extraction runs only when configured.
- No advice engine, persuasion engine, or romantic scoring system.
- No deep/oversized profile intake; advanced study forms are Phase 2 material.

## Optional AI extraction

Ryan Memory OS can optionally route extraction through multiple local browser-configured providers:

- Gemini API
- OpenRouter
- OpenAI-compatible custom providers
- Local heuristic fallback, always available and always last in Auto mode

The AI worker only extracts structured memory from reports: facts, signals, emotions, risks, open loops, uncertainty, and compressed memory updates. It does not advise, score, persuade, write messages, or save anything silently.

Extraction modes:

- Local: deterministic local heuristic only.
- AI only: tries enabled remote providers by priority and shows a clear error if all fail.
- Auto: tries enabled remote providers by priority, then clearly falls back to the local heuristic if remote extraction fails.

API key safety:

- Do not put keys in source code.
- Do not commit keys to GitHub.
- In-app AI Provider Manager stores keys locally in this browser only.
- `.env.local` may define `VITE_GEMINI_API_KEY` or `VITE_OPENROUTER_API_KEY` for local developer convenience only.
- Workspace exports, target exports, Ryan Case Packets, demo data, logs, and Git-tracked files do not include AI API keys.
- For public SaaS/production, provider calls must move behind a backend proxy. Do not use frontend-stored production keys.

## Local development

Install dependencies:

```powershell
npm.cmd install
```

Run the local dev server:

```powershell
npm.cmd run dev
```

Run tests:

```powershell
npm.cmd test
```

Run the production build:

```powershell
npm.cmd run build
```

Browser data lives in IndexedDB for the active browser profile. Export JSON periodically if you need a portable backup.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data schema](docs/DATA_SCHEMA.md)
- [QA checklist](docs/QA_CHECKLIST.md)
- [Build report](BUILD_REPORT.md)
