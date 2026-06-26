# Architecture — Ryan Memory OS Phase 1

## Intent

The app is a browser-only memory system. It preserves the factual story and produces a compact, portable Ryan Case Packet for use in a separate conversation with GPT, Claude, Grok, or another assistant. The app does not call those services and does not supply advice.

## Runtime shape

```text
React + TypeScript + Vite UI
        |
        v
Application services / hooks
        |
        +--> Dexie repository --> IndexedDB (browser-local data)
        |
        +--> Local extractor --> Review queue --> Merge/compression
        |
        +--> Packet generator --> Clipboard / Markdown / JSON download
```

The browser is the only required runtime. No backend, account, third-party API, or network connection is necessary for normal use.

## Main areas

- **Dashboard** — current workspace state, recent activity, storage health, and a clear next step.
- **User Profile** — focused user context, saved locally with practical autosave protection.
- **Targets** — one container per person, holding profile facts, reports, memory, event history, and summaries.
- **Add Report** — raw user-entered report associated with a target and report metadata.
- **Memory Review** — editable local extraction before derived memory is written.
- **Export Packet** — produces selected-target Markdown/JSON case packets and JSON backup/export.
- **System Audit** — finds incomplete/malformed local records, storage issues, and export status.

## Persistence and auditability

Dexie is the only persistence layer. Raw reports are retained separately from derived memory. Saving reviewed extraction must add chronological events and link derived facts/signals/risks/open loops back to their originating report. Merging should consolidate normalized duplicates while preserving `lastSeen`, confidence, and historical evidence.

All primary records carry `createdAt` and `lastUpdated` timestamps. Metadata records include the schema version and operational values such as the most recent export timestamp.

## Extraction boundary

`src/lib/memory/extractor.ts` implements the Phase 1 deterministic extractor. It identifies simple fact, signal, emotion, conflict/risk, and open-loop cues from raw text and always allows human correction before persistence.

`src/lib/ai/aiProvider.ts` defines a future-facing provider abstraction. The local deterministic provider is the default. Any OpenRouter-shaped placeholder is nonfunctional, has no embedded key, and must not issue remote requests in Phase 1.

## Safety and recovery

- Validate required fields before save and surface errors near the action.
- Confirm deletion, reset, discard, and demo clearing actions.
- Validate all import payloads before a transaction writes any record.
- Wrap the app in an error boundary/safe fallback with a reset/retry path.
- Tag fixtures with `metadata.isDemo`; demo clearing removes only those records.
- Make download and clipboard failures visible, with an alternative action where practical.
