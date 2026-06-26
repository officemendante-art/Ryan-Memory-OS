import Dexie, { type Table } from "dexie";
import {
  SCHEMA_VERSION, type AppMetadata, type MemoryPacket, type RawReport, type TargetBundleExport, type TargetContainer,
  type UserProfile, type WorkspaceExport, type RecordMetadata, createTarget, newId, nowIso,
} from "../schema";

export class RyanMemoryDatabase extends Dexie {
  userProfiles!: Table<UserProfile, string>;
  targets!: Table<TargetContainer, string>;
  reports!: Table<RawReport, string>;
  packets!: Table<MemoryPacket, string>;
  metadata!: Table<AppMetadata, string>;

  constructor() {
    super("ryan-memory-os");
    this.version(SCHEMA_VERSION).stores({
      userProfiles: "id, lastUpdated",
      targets: "id, alias, lastUpdated, metadata.isDemo",
      reports: "id, targetId, occurredAt, lastUpdated, metadata.isDemo",
      packets: "id, targetId, reportId, lastUpdated, metadata.isDemo",
      metadata: "id, lastUpdated, metadata.isDemo",
    });
  }
}

export const db = new RyanMemoryDatabase();

export class ImportValidationError extends Error {
  constructor(public readonly issues: string[]) { super(issues.join(" ")); this.name = "ImportValidationError"; }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const hasTimestamp = (value: Record<string, unknown>): boolean => isString(value.createdAt) && isString(value.lastUpdated);
const validTarget = (value: unknown): value is TargetContainer => isRecord(value) && isString(value.id) && isString(value.alias) && value.alias.trim().length > 0 && hasTimestamp(value) && Array.isArray(value.facts) && Array.isArray(value.signals) && Array.isArray(value.events);
const validReport = (value: unknown): value is RawReport => isRecord(value) && isString(value.id) && isString(value.targetId) && isString(value.content) && isString(value.occurredAt) && hasTimestamp(value);
const validPacket = (value: unknown): value is MemoryPacket => isRecord(value) && isString(value.id) && isString(value.targetId) && isString(value.reportId) && isRecord(value.identity) && hasTimestamp(value);
const importedMetadata = (metadata: RecordMetadata | undefined, importedAt: string): RecordMetadata => ({ ...metadata, source: "import", importedAt });

function remapTargetReportReferences(target: TargetContainer, reportIds: Map<string, string>): TargetContainer {
  const remap = (ids: string[]): string[] => ids.map((id) => reportIds.get(id) ?? id);
  target.events = target.events.map((event) => ({ ...event, reportId: reportIds.get(event.reportId) ?? event.reportId }));
  target.facts = target.facts.map((item) => ({ ...item, sourceReportIds: remap(item.sourceReportIds) }));
  target.signals = target.signals.map((item) => ({ ...item, sourceReportIds: remap(item.sourceReportIds) }));
  target.emotionState = target.emotionState.map((item) => ({ ...item, sourceReportIds: remap(item.sourceReportIds) }));
  target.risks = target.risks.map((item) => ({ ...item, sourceReportIds: remap(item.sourceReportIds) }));
  target.openLoops = target.openLoops.map((item) => ({ ...item, sourceReportIds: remap(item.sourceReportIds) }));
  target.patternHints = target.patternHints.map((item) => ({ ...item, sourceReportIds: remap(item.sourceReportIds) }));
  return target;
}

function parseJson(input: string | unknown): unknown {
  if (typeof input !== "string") return input;
  try { return JSON.parse(input); } catch { throw new ImportValidationError(["The selected file is not valid JSON."]); }
}

export function validateTargetBundleImport(input: string | unknown): TargetBundleExport {
  const parsed = parseJson(input);
  const issues: string[] = [];
  if (!isRecord(parsed)) throw new ImportValidationError(["Import must be a JSON object."]);
  if (parsed.schemaVersion !== SCHEMA_VERSION) issues.push(`Unsupported schemaVersion. Expected ${SCHEMA_VERSION}.`);
  if (parsed.exportType !== "target-bundle") issues.push("This file is not a target-bundle export.");
  if (!validTarget(parsed.target)) issues.push("Target data is missing its alias, timestamps, or memory collections.");
  if (!Array.isArray(parsed.reports) || !parsed.reports.every(validReport)) issues.push("Reports are malformed.");
  if (!Array.isArray(parsed.packets) || !parsed.packets.every(validPacket)) issues.push("Memory packets are malformed.");
  const importTarget = validTarget(parsed.target) ? parsed.target : undefined;
  if (importTarget && Array.isArray(parsed.reports) && parsed.reports.every(validReport) && parsed.reports.some((report) => report.targetId !== importTarget.id)) issues.push("A report belongs to a different target.");
  if (importTarget && Array.isArray(parsed.packets) && parsed.packets.every(validPacket) && parsed.packets.some((packet) => packet.targetId !== importTarget.id)) issues.push("A memory packet belongs to a different target.");
  if (Array.isArray(parsed.reports) && parsed.reports.every(validReport) && Array.isArray(parsed.packets) && parsed.packets.every(validPacket)) {
    const reportIds = new Set(parsed.reports.map((report) => report.id));
    if (parsed.packets.some((packet) => !reportIds.has(packet.reportId))) issues.push("A memory packet references a missing report.");
  }
  if (issues.length) throw new ImportValidationError(issues);
  return parsed as unknown as TargetBundleExport;
}

export function validateWorkspaceImport(input: string | unknown): WorkspaceExport {
  const parsed = parseJson(input);
  const issues: string[] = [];
  if (!isRecord(parsed)) throw new ImportValidationError(["Import must be a JSON object."]);
  if (parsed.schemaVersion !== SCHEMA_VERSION) issues.push(`Unsupported schemaVersion. Expected ${SCHEMA_VERSION}.`);
  if (parsed.exportType !== "workspace") issues.push("This file is not a workspace export.");
  if (!Array.isArray(parsed.targets) || !parsed.targets.every(validTarget)) issues.push("Targets are malformed.");
  if (!Array.isArray(parsed.reports) || !parsed.reports.every(validReport)) issues.push("Reports are malformed.");
  if (!Array.isArray(parsed.packets) || !parsed.packets.every(validPacket)) issues.push("Memory packets are malformed.");
  if (!Array.isArray(parsed.metadata)) issues.push("Metadata is malformed.");
  if (Array.isArray(parsed.targets) && parsed.targets.every(validTarget) && Array.isArray(parsed.reports) && parsed.reports.every(validReport)) {
    const targetIds = new Set(parsed.targets.map((target) => target.id));
    if (parsed.reports.some((report) => !targetIds.has(report.targetId))) issues.push("A report references a missing target.");
    if (Array.isArray(parsed.packets) && parsed.packets.every(validPacket)) {
      const reportIds = new Set(parsed.reports.map((report) => report.id));
      if (parsed.packets.some((packet) => !targetIds.has(packet.targetId) || !reportIds.has(packet.reportId))) issues.push("A memory packet references a missing target or report.");
    }
  }
  if (issues.length) throw new ImportValidationError(issues);
  return parsed as unknown as WorkspaceExport;
}

export async function saveUserProfile(profile: Omit<UserProfile, "id" | "createdAt" | "lastUpdated"> & Partial<Pick<UserProfile, "createdAt">>): Promise<UserProfile> {
  const previous = await db.userProfiles.get("primary");
  const saved: UserProfile = { ...profile, id: "primary", createdAt: previous?.createdAt ?? profile.createdAt ?? nowIso(), lastUpdated: nowIso() };
  await db.userProfiles.put(saved);
  return saved;
}

export async function saveTarget(target: TargetContainer): Promise<TargetContainer> {
  if (!target.alias.trim()) throw new Error("A target alias is required.");
  const saved = { ...target, alias: target.alias.trim(), lastUpdated: nowIso() };
  await db.targets.put(saved);
  return saved;
}

export async function addTarget(alias: string, fields: Partial<TargetContainer> = {}): Promise<TargetContainer> {
  if (!alias.trim()) throw new Error("A target alias is required.");
  const target = createTarget(alias, fields);
  await db.targets.add(target);
  return target;
}

export async function duplicateTarget(targetId: string): Promise<TargetContainer> {
  const source = await db.targets.get(targetId);
  if (!source) throw new Error("Target not found.");
  const timestamp = nowIso();
  const copy = structuredClone(source);
  copy.id = newId(); copy.alias = `${source.alias} copy`; copy.createdAt = timestamp; copy.lastUpdated = timestamp;
  copy.events = []; copy.facts = []; copy.signals = []; copy.emotionState = []; copy.risks = []; copy.openLoops = []; copy.patternHints = []; copy.summary = "No reviewed memory yet.";
  await db.targets.add(copy);
  return copy;
}

export async function deleteTarget(targetId: string): Promise<void> {
  await db.transaction("rw", db.targets, db.reports, db.packets, async () => {
    await db.reports.where("targetId").equals(targetId).delete();
    await db.packets.where("targetId").equals(targetId).delete();
    await db.targets.delete(targetId);
  });
}

export async function saveReport(report: RawReport): Promise<RawReport> {
  if (!report.targetId || !report.content.trim()) throw new Error("Choose a target and enter a report before saving.");
  const saved = { ...report, content: report.content.trim(), lastUpdated: nowIso() };
  await db.reports.put(saved);
  return saved;
}

export async function savePacket(packet: MemoryPacket): Promise<MemoryPacket> {
  const saved = { ...packet, lastUpdated: nowIso() };
  await db.packets.put(saved);
  return saved;
}

export async function setMetadata(id: string, value: string): Promise<AppMetadata> {
  const prior = await db.metadata.get(id);
  const item: AppMetadata = { id, value, createdAt: prior?.createdAt ?? nowIso(), lastUpdated: nowIso(), metadata: { source: "local" } };
  await db.metadata.put(item);
  return item;
}

export async function exportTargetBundle(targetId: string): Promise<TargetBundleExport> {
  const target = await db.targets.get(targetId);
  if (!target) throw new Error("Target not found.");
  const [reports, packets] = await Promise.all([db.reports.where("targetId").equals(targetId).toArray(), db.packets.where("targetId").equals(targetId).toArray()]);
  return { schemaVersion: SCHEMA_VERSION, exportType: "target-bundle", exportedAt: nowIso(), target, reports, packets };
}

export async function exportWorkspace(): Promise<WorkspaceExport> {
  const [userProfile, targets, reports, packets, metadata] = await Promise.all([db.userProfiles.get("primary"), db.targets.toArray(), db.reports.toArray(), db.packets.toArray(), db.metadata.toArray()]);
  return { schemaVersion: SCHEMA_VERSION, exportType: "workspace", exportedAt: nowIso(), userProfile, targets, reports, packets, metadata };
}

/** Validates first, then atomically imports a bundle under fresh IDs to prevent collisions. */
export async function importTargetBundle(input: string | unknown): Promise<TargetContainer> {
  const bundle = validateTargetBundleImport(input);
  const target = structuredClone(bundle.target);
  const targetId = newId();
  const reportIds = new Map<string, string>();
  for (const report of bundle.reports) reportIds.set(report.id, newId());
  target.id = targetId;
  remapTargetReportReferences(target, reportIds);
  const importedAt = nowIso();
  target.metadata = importedMetadata(target.metadata, importedAt);
  const reports: RawReport[] = bundle.reports.map((report) => ({ ...structuredClone(report), id: reportIds.get(report.id)!, targetId, metadata: importedMetadata(report.metadata, importedAt) }));
  const packets: MemoryPacket[] = bundle.packets.map((packet) => ({ ...structuredClone(packet), id: newId(), targetId, reportId: reportIds.get(packet.reportId) ?? packet.reportId, metadata: importedMetadata(packet.metadata, importedAt) }));
  // All validation happened before this point; the transaction prevents partial writes.
  await db.transaction("rw", db.targets, db.reports, db.packets, async () => { await db.targets.add(target); await db.reports.bulkAdd(reports); await db.packets.bulkAdd(packets); });
  return target;
}

/** Workspace import is additive and remaps every target/report/packet identity. */
export async function importWorkspace(input: string | unknown): Promise<{ importedTargetCount: number }> {
  const workspace = validateWorkspaceImport(input);
  const targetIds = new Map<string, string>();
  const reportIds = new Map<string, string>();
  workspace.targets.forEach((target) => targetIds.set(target.id, newId()));
  workspace.reports.forEach((report) => reportIds.set(report.id, newId()));
  const importedAt = nowIso();
  const targets: TargetContainer[] = workspace.targets.map((target) => {
    const copied = structuredClone(target);
    remapTargetReportReferences(copied, reportIds);
    return { ...copied, id: targetIds.get(target.id)!, metadata: importedMetadata(target.metadata, importedAt) };
  });
  const reports: RawReport[] = workspace.reports.filter((report) => targetIds.has(report.targetId)).map((report) => ({ ...structuredClone(report), id: reportIds.get(report.id)!, targetId: targetIds.get(report.targetId)!, metadata: importedMetadata(report.metadata, importedAt) }));
  const packets: MemoryPacket[] = workspace.packets.filter((packet) => targetIds.has(packet.targetId)).map((packet) => ({ ...structuredClone(packet), id: newId(), targetId: targetIds.get(packet.targetId)!, reportId: reportIds.get(packet.reportId) ?? packet.reportId, metadata: importedMetadata(packet.metadata, importedAt) }));
  await db.transaction("rw", db.targets, db.reports, db.packets, async () => { await db.targets.bulkAdd(targets); await db.reports.bulkAdd(reports); await db.packets.bulkAdd(packets); });
  return { importedTargetCount: targets.length };
}

export async function clearDemoData(): Promise<void> {
  await db.transaction("rw", db.targets, db.reports, db.packets, db.metadata, async () => {
    await db.targets.filter((item) => item.metadata?.isDemo === true).delete();
    await db.reports.filter((item) => item.metadata?.isDemo === true).delete();
    await db.packets.filter((item) => item.metadata?.isDemo === true).delete();
    await db.metadata.filter((item) => item.metadata?.isDemo === true).delete();
  });
}
