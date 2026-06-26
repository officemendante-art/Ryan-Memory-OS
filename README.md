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
- Require human review before saving extracted memory.
- Merge selected memory into a target timeline/container.
- Export Ryan Case Packets as Markdown or JSON.
- Export/import target JSON with validation before IndexedDB writes.
- Load and clear opt-in demo data without deleting real records.

## Phase 1 does NOT do

- No SaaS, login, auth, payments, analytics, or cloud sync.
- No WhatsApp, social-media, or external message integrations.
- No paid API requirement or hidden remote AI call.
- No advice engine, persuasion engine, or romantic scoring system.
- No deep/oversized profile intake; advanced study forms are Phase 2 material.

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
