# Ryan Memory OS — Agent Instructions

## Product boundary

Ryan Memory OS is a private, local-first memory workspace. It helps a single user capture relationship context, keep an accurate timeline, review extracted memory, and export a clean case packet for an external model such as GPT, Claude, or Grok.

It is **not** a dating-advice engine. Do not add romantic advice, recommendations, persuasion tactics, scoring of people, cloud sync, authentication, payments, WhatsApp integrations, analytics, or remote AI calls in Phase 1.

## Technical boundary

- Build at the repository root with React, TypeScript, and Vite.
- Persist application data with Dexie over IndexedDB. No server or cloud dependency.
- Keep the default extraction provider deterministic and local. An AI-provider interface may exist, but must not require a key or make network requests.
- Keep the focused MVP profile forms; reserve deep/advanced intake for a later phase.
- All user-facing data belongs to the browser profile. Refreshing the page must preserve saved data.

## Quality rules

- Keep the visible product name exactly `Ryan Memory OS`.
- Every stored entity must include `lastUpdated`; exports must include `schemaVersion` and an export timestamp.
- Validate imports completely before writing any record to IndexedDB.
- Use confirmations for destructive actions, clear validation feedback for invalid input, and safe error UI rather than a blank screen.
- Demo data is opt-in and must be tagged `metadata.isDemo`; clearing it must never delete real records.
- Do not expose internal UUIDs in normal product UI.
- Do not leave visible buttons without working behavior.

## Documentation and verification

- Update `BUILD_REPORT.md` after each major implementation or verification pass with completed work, commands/results, known issues, and the next step.
- Keep `docs/DATA_SCHEMA.md` aligned with the persisted Dexie schema and exported JSON contract.
- Run the documented test/build checks before claiming completion. Report blockers plainly; do not convert a planned integration into a completed one.
