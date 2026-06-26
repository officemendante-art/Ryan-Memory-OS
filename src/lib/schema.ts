/** Core domain types for the local-only Ryan Memory OS. */

export const SCHEMA_VERSION = 1 as const;

export type Confidence = "low" | "medium" | "high";
export type ReportType =
  | "conversation_update"
  | "new_fact"
  | "conflict"
  | "positive_signal"
  | "negative_signal"
  | "meetup"
  | "social_media"
  | "call"
  | "other"
  // Kept for existing local records and UI integrations created during Phase 1.
  | "note" | "conversation" | "observation" | "reflection";
export type FactCategory = "preference" | "identity" | "detail" | "boundary";
export type SignalDirection = "positive" | "negative" | "mixed" | "neutral";

export interface RecordMetadata {
  isDemo?: boolean;
  importedAt?: string;
  source?: "local" | "import" | "demo";
}

export interface UserProfile {
  id: "primary";
  name?: string;
  displayName?: string;
  preferredName?: string;
  pronouns?: string;
  ageRange?: string;
  occupation?: string;
  location?: string;
  interests?: string;
  relationshipStatus?: string;
  communicationStyle?: string;
  relationshipGoals?: string;
  goals?: string;
  boundaries?: string;
  context?: string;
  personalContext?: string;
  advisorContext?: string;
  notes?: string;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}

export interface RawReport {
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

export interface NormalizedFact {
  id: string;
  text: string;
  normalizedText: string;
  category: FactCategory;
  confidence: Confidence;
  sourceReportIds: string[];
  createdAt: string;
  lastSeen: string;
  lastUpdated: string;
}

export interface Signal {
  id: string;
  text: string;
  direction: SignalDirection;
  confidence: Confidence;
  sourceReportIds: string[];
  createdAt: string;
  lastSeen: string;
  lastUpdated: string;
}

export interface EmotionState {
  id: string;
  label: string;
  text: string;
  confidence: Confidence;
  sourceReportIds: string[];
  createdAt: string;
  lastSeen: string;
  lastUpdated: string;
}

export interface Risk {
  id: string;
  text: string;
  status: "open" | "resolved";
  confidence: Confidence;
  sourceReportIds: string[];
  createdAt: string;
  lastSeen: string;
  lastUpdated: string;
}

export interface OpenLoop {
  id: string;
  text: string;
  status: "open" | "resolved";
  sourceReportIds: string[];
  createdAt: string;
  lastSeen: string;
  lastUpdated: string;
}

export interface PatternHint {
  id: string;
  text: string;
  confidence: Confidence;
  sourceReportIds: string[];
  createdAt: string;
  lastSeen: string;
  lastUpdated: string;
}

export interface MemoryEvent {
  id: string;
  reportId: string;
  occurredAt: string;
  type: ReportType;
  summary: string;
  createdAt: string;
  lastUpdated: string;
}

export interface TargetContainer {
  id: string;
  alias: string;
  fullName?: string;
  ageRange?: string;
  occupation?: string;
  location?: string;
  howMet?: string;
  firstMetAt?: string;
  currentDynamic?: string;
  communicationStyle?: string;
  interests?: string;
  relationshipContext?: string;
  profile?: { relationshipContext?: string; location?: string; notes?: string };
  boundaries?: string;
  notes?: string;
  facts: NormalizedFact[];
  signals: Signal[];
  emotionState: EmotionState[];
  risks: Risk[];
  openLoops: OpenLoop[];
  patternHints: PatternHint[];
  events: MemoryEvent[];
  strategyNotes?: string;
  summary: string;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}

export interface ExtractedFact {
  text: string;
  category: FactCategory;
  confidence: Confidence;
}

export interface ExtractedSignal {
  text: string;
  direction: SignalDirection;
  confidence: Confidence;
}

export interface ExtractedEmotion {
  label: string;
  text: string;
  confidence: Confidence;
}

export interface ExtractedRisk {
  text: string;
  confidence: Confidence;
}

export interface ExtractedOpenLoop {
  text: string;
}

export interface MemoryPacket {
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
  confidence: Confidence;
  needsHumanReview: boolean;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}

export interface AppMetadata {
  id: string;
  value: string;
  createdAt: string;
  lastUpdated: string;
  metadata?: RecordMetadata;
}

export interface TargetBundleExport {
  schemaVersion: number;
  exportType: "target-bundle";
  exportedAt: string;
  target: TargetContainer;
  reports: RawReport[];
  packets: MemoryPacket[];
}

export interface WorkspaceExport {
  schemaVersion: number;
  exportType: "workspace";
  exportedAt: string;
  userProfile?: UserProfile;
  targets: TargetContainer[];
  reports: RawReport[];
  packets: MemoryPacket[];
  metadata: AppMetadata[];
}

export interface RyanCasePacket {
  schemaVersion: number;
  generatedAt: string;
  userContext?: Pick<UserProfile, "name" | "preferredName" | "relationshipGoals" | "personalContext" | "advisorContext">;
  target: Pick<TargetContainer, "alias" | "fullName" | "location" | "relationshipContext" | "summary">;
  story: MemoryEvent[];
  importantMemory: { facts: NormalizedFact[]; signals: Signal[]; emotionState: EmotionState[] };
  risks: Risk[];
  openLoops: OpenLoop[];
  advisorTask: string;
}

export const nowIso = (): string => new Date().toISOString();

export const newId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `rmo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeMemoryText = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");

export const confidenceRank = (confidence: Confidence): number => ({ low: 1, medium: 2, high: 3 })[confidence];

export const maxConfidence = (a: Confidence, b: Confidence): Confidence =>
  confidenceRank(a) >= confidenceRank(b) ? a : b;

export function createTarget(alias: string, fields: Partial<TargetContainer> = {}): TargetContainer {
  const timestamp = nowIso();
  return {
    id: newId(), alias: alias.trim(), facts: [], signals: [], emotionState: [], risks: [], openLoops: [],
    patternHints: [], events: [], summary: "No reviewed memory yet.", createdAt: timestamp, lastUpdated: timestamp,
    metadata: { source: "local" }, ...fields,
  };
}
