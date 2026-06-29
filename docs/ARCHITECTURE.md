# Architecture — Ryan Memory OS Phase 1

## Intent

Ryan Memory OS is a browser-only memory system. It preserves the factual story and produces a compact, portable Ryan Case Packet for use in a separate conversation with GPT, Claude, Grok, or another assistant. The app does not supply advice.

## Runtime shape

```text
React + TypeScript + Vite UI
        |
        v
Application services / hooks
        |
        +--> Dexie repository --> IndexedDB (browser-local relationship memory)
        |
        +--> AI router / Local extractor --> Review queue --> Merge/compression
        |
        +--> Packet generator --> Clipboard / Markdown / JSON download
```

The browser is the only required runtime. No backend, account, third-party API, or network connection is necessary for normal local use. Optional remote extraction only runs when the user configures a local provider key and chooses AI/Auto extraction.

## Main areas

- **Dashboard** — current workspace state, recent activity, storage health, and a clear next step.
- **User Profile** — focused user context, saved locally with practical autosave protection.
- **Targets** — one container per person, holding profile facts, reports, memory, event history, and summaries.
- **Add Report** — raw user-entered report associated with a target and report metadata.
- **Memory Review** — editable extraction before derived memory is written.
- **Export Packet** — produces selected-target Markdown/JSON case packets and JSON backup/export.
- **AI Provider Manager** — browser-local provider/key manager for Gemini, OpenRouter, custom OpenAI-compatible providers, and the local heuristic fallback.
- **System Audit** — finds incomplete/malformed local records, storage issues, and export status.

## Persistence and auditability

Dexie is the only relationship-memory persistence layer. Raw reports are retained separately from derived memory. Saving reviewed extraction must add chronological events and link derived facts/signals/risks/open loops back to their originating report. Merging should consolidate normalized duplicates while preserving `lastSeen`, confidence, and historical evidence.

All primary records carry `createdAt` and `lastUpdated` timestamps. Metadata records include schema version and operational values such as the most recent export timestamp.

## Extraction boundary

`src/lib/memory/extractor.ts` implements the deterministic local extractor. It identifies simple fact, signal, emotion, conflict/risk, and open-loop cues from raw text and always allows human correction before persistence.

`src/lib/ai/aiRouter.ts` runs the provider fallback chain:

- Local mode uses only the deterministic extractor.
- AI-only mode tries enabled remote providers by priority and fails safely if all providers fail.
- Auto mode tries enabled remote providers first and then clearly falls back to the local heuristic.

`src/lib/ai/aiSettings.ts` stores provider settings in browser `localStorage` only. It normalizes the local heuristic provider as the final fallback and redacts keys for public settings views. AI settings are operational metadata, not relationship memory, and are never included in workspace exports, target exports, Ryan Case Packets, demo data, logs, or Git.

Provider implementations live under `src/lib/ai/providers/`:

- `geminiProvider.ts` calls Gemini `generateContent`.
- `openRouterProvider.ts` wraps OpenRouter as an OpenAI-compatible provider.
- `openAICompatibleProvider.ts` handles custom OpenAI-compatible chat-completions providers plus shared JSON validation.

All model output is untrusted JSON. It must pass `validateAiMemoryPacket` before entering the mandatory Memory Review queue, and no provider can save memory directly.

## Safety and recovery

- Validate required fields before save and surface errors near the action.
- Confirm deletion, reset, discard, and demo clearing actions.
- Validate all import payloads before a transaction writes any record.
- Wrap the app in an error boundary/safe fallback with a reset/retry path.
- Tag fixtures with `metadata.isDemo`; demo clearing removes only those records.
- Make download and clipboard failures visible, with an alternative action where practical.
- Keep AI prompts extraction-only: no dating advice, persuasion tactics, scoring, or invented facts.
