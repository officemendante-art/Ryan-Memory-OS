# Data Schema — Ryan Memory OS Phase 1

## Shared conventions

- IDs are internal UUID-like keys and are not shown in normal product UI.
- Times use ISO 8601 strings.
- Every persisted entity includes `createdAt` and `lastUpdated`.
- Every downloadable JSON export includes `schemaVersion` and an export timestamp.
- Demo data is tagged with `metadata.isDemo === true`; demo clearing uses that tag only.
- Imports are validated completely before any IndexedDB write occurs.

## Dexie database

Database name: `ryan-memory-os`

Current schema version: `1`

| Table | Store definition | Purpose |
| --- | --- | --- |
| `userProfiles` | `id, lastUpdated` | Single focused local user profile, keyed by `primary`. |
| `targets` | `id, alias, lastUpdated, metadata.isDemo` | Target containers plus reviewed memory. |
| `reports` | `id, targetId, occurredAt, lastUpdated, metadata.isDemo` | Raw report/source notes. |
| `packets` | `id, targetId, reportId, lastUpdated, metadata.isDemo` | Reviewed extraction packets. |
| `metadata` | `id, lastUpdated, metadata.isDemo` | Operational metadata such as last export time. |

## Local AI settings

Optional AI extraction settings are browser-local operational settings, not relationship memory.

- Storage key: `ryan-memory-os-ai-settings`
- Storage surface: `localStorage`
- Contents: provider, extraction mode, model, temperature, max tokens, optional local OpenRouter API key, and last test status.
- Export policy: never included in target bundles, workspace exports, Ryan Case Packets, or demo data.
- `.env.local` may provide `VITE_OPENROUTER_API_KEY` for local developer convenience only; it remains ignored by Git.

## User profile

```ts
interface UserProfile {
  id: "primary";
  name?: string;
  preferredName?: string;
  location?: string;
  relationshipGoals?: string;
  communicationStyle?: string;
  personalContext?: string;
  advisorContext?: string;
  notes?: string;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}
```

The focused MVP profile keeps all fields optional except the UI requires a name/nickname before saving.

## Target container

```ts
interface TargetContainer {
  id: string;
  alias: string;
  fullName?: string;
  ageRange?: string;
  location?: string;
  relationshipContext?: string;
  notes?: string;
  facts: NormalizedFact[];
  signals: Signal[];
  emotionState: EmotionState[];
  risks: Risk[];
  openLoops: OpenLoop[];
  patternHints: PatternHint[];
  events: MemoryEvent[];
  summary: string;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}
```

`alias` is the only required target profile field. Duplicate target containers get a fresh ID and timestamps, while reviewed memory starts clean.

## Raw reports and reviewed packets

```ts
interface RawReport {
  id: string;
  targetId: string;
  occurredAt: string;
  type: ReportType;
  title?: string;
  content: string;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}

interface MemoryPacket {
  id: string;
  reportId: string;
  targetId: string;
  identity: { targetAlias: string; reportType: ReportType; occurredAt: string };
  rawSummary: string;
  facts: ExtractedFact[];
  signals: ExtractedSignal[];
  emotions: ExtractedEmotion[];
  risks: ExtractedRisk[];
  openLoops: ExtractedOpenLoop[];
  patternHints: string[];
  compressedUpdate: string;
  confidence: "low" | "medium" | "high";
  needsHumanReview: boolean;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}
```

Saving reviewed memory writes the raw report, the reviewed packet, and the merged target container in one Dexie transaction.

## Export contracts

```ts
interface TargetBundleExport {
  schemaVersion: number;
  exportType: "target-bundle";
  exportedAt: string;
  target: TargetContainer;
  reports: RawReport[];
  packets: MemoryPacket[];
}

interface WorkspaceExport {
  schemaVersion: number;
  exportType: "workspace";
  exportedAt: string;
  userProfile?: UserProfile;
  targets: TargetContainer[];
  reports: RawReport[];
  packets: MemoryPacket[];
  metadata: AppMetadata[];
}
```

Target imports validate schema version, export type, target shape, report shape, packet shape, and target/report references. Imported IDs are remapped before records are written so a file cannot overwrite existing local records.

Ryan Case Packet exports are selected-target artifacts, not full backups. They include the optional user capsule, target capsule, story so far, important memory, recent events, risks/open loops, and the advisor task template.
