import { type MemoryPacket, type TargetContainer, type RawReport, maxConfidence, newId, normalizeMemoryText, nowIso } from "../schema";
import { compressTarget } from "./compression";

const mergeSources = (sources: string[], reportId: string) => sources.includes(reportId) ? sources : [...sources, reportId];
const same = (category: string, text: string, other: { category?: string; normalizedText?: string; text: string }) =>
  (other.category ?? "") === category && (other.normalizedText ?? normalizeMemoryText(other.text)) === normalizeMemoryText(text);

/** Applies a reviewed packet in-memory. Persistence is intentionally delegated to storage/UI. */
export function mergeMemoryPacket(target: TargetContainer, report: RawReport, packet: MemoryPacket): TargetContainer {
  if (packet.targetId !== target.id || report.targetId !== target.id) throw new Error("Packet and report must belong to the selected target.");
  const timestamp = nowIso();
  const next: TargetContainer = structuredClone(target);
  for (const fact of packet.facts) {
    const existing = next.facts.find((item) => same(fact.category, fact.text, item));
    if (existing) { existing.confidence = maxConfidence(existing.confidence, fact.confidence); existing.sourceReportIds = mergeSources(existing.sourceReportIds, report.id); existing.lastSeen = report.occurredAt; existing.lastUpdated = timestamp; }
    else next.facts.push({ id: newId(), text: fact.text, normalizedText: normalizeMemoryText(fact.text), category: fact.category, confidence: fact.confidence, sourceReportIds: [report.id], createdAt: timestamp, lastSeen: report.occurredAt, lastUpdated: timestamp });
  }
  for (const signal of packet.signals) {
    const existing = next.signals.find((item) => item.direction === signal.direction && normalizeMemoryText(item.text) === normalizeMemoryText(signal.text));
    if (existing) { existing.confidence = maxConfidence(existing.confidence, signal.confidence); existing.sourceReportIds = mergeSources(existing.sourceReportIds, report.id); existing.lastSeen = report.occurredAt; existing.lastUpdated = timestamp; }
    else next.signals.push({ id: newId(), text: signal.text, direction: signal.direction, confidence: signal.confidence, sourceReportIds: [report.id], createdAt: timestamp, lastSeen: report.occurredAt, lastUpdated: timestamp });
  }
  for (const emotion of packet.emotions) next.emotionState.push({ id: newId(), label: emotion.label, text: emotion.text, confidence: emotion.confidence, sourceReportIds: [report.id], createdAt: timestamp, lastSeen: report.occurredAt, lastUpdated: timestamp });
  for (const risk of packet.risks) {
    const existing = next.risks.find((item) => normalizeMemoryText(item.text) === normalizeMemoryText(risk.text));
    if (existing) { existing.confidence = maxConfidence(existing.confidence, risk.confidence); existing.sourceReportIds = mergeSources(existing.sourceReportIds, report.id); existing.lastSeen = report.occurredAt; existing.lastUpdated = timestamp; }
    else next.risks.push({ id: newId(), text: risk.text, status: "open", confidence: risk.confidence, sourceReportIds: [report.id], createdAt: timestamp, lastSeen: report.occurredAt, lastUpdated: timestamp });
  }
  for (const loop of packet.openLoops) {
    const existing = next.openLoops.find((item) => normalizeMemoryText(item.text) === normalizeMemoryText(loop.text));
    if (existing) { existing.sourceReportIds = mergeSources(existing.sourceReportIds, report.id); existing.lastSeen = report.occurredAt; existing.lastUpdated = timestamp; }
    else next.openLoops.push({ id: newId(), text: loop.text, status: "open", sourceReportIds: [report.id], createdAt: timestamp, lastSeen: report.occurredAt, lastUpdated: timestamp });
  }
  // A conflict is never silently reduced to a historical fact: it always gets
  // a reviewable follow-up unless the reviewer supplied a more specific loop.
  if (report.type === "conflict" && packet.openLoops.length === 0) {
    const text = `Review and clarify the conflict: ${packet.rawSummary}`;
    next.openLoops.push({ id: newId(), text, status: "open", sourceReportIds: [report.id], createdAt: timestamp, lastSeen: report.occurredAt, lastUpdated: timestamp });
  }
  for (const hint of packet.patternHints) next.patternHints.push({ id: newId(), text: hint, confidence: packet.confidence, sourceReportIds: [report.id], createdAt: timestamp, lastSeen: report.occurredAt, lastUpdated: timestamp });
  if (!next.events.some((event) => event.reportId === report.id)) next.events.push({ id: newId(), reportId: report.id, occurredAt: report.occurredAt, type: report.type, summary: packet.rawSummary, createdAt: timestamp, lastUpdated: timestamp });
  next.events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  next.summary = compressTarget(next);
  next.lastUpdated = timestamp;
  return next;
}
