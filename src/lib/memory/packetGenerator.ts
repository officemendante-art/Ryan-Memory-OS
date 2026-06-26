import type { RyanCasePacket, TargetContainer, UserProfile } from "../schema";
import { SCHEMA_VERSION, nowIso } from "../schema";

export const DEFAULT_ADVISOR_TASK = [
  "Use this factual case packet as context. Do not treat inferred signals as certainty; ask clarifying questions where evidence is missing.",
  "",
  "Respond with:",
  "1. The read",
  "2. The risk",
  "3. The best move",
  "4. Exact line options",
  "5. What to watch next",
  "6. If she responds X, do Y",
  "7. If she rejects/is uninterested, exit cleanly",
].join("\n");

export function generateRyanCasePacket(target: TargetContainer, userProfile?: UserProfile, advisorTask = DEFAULT_ADVISOR_TASK): RyanCasePacket {
  return {
    schemaVersion: SCHEMA_VERSION, generatedAt: nowIso(),
    userContext: userProfile ? { name: userProfile.name, preferredName: userProfile.preferredName, relationshipGoals: userProfile.relationshipGoals, personalContext: userProfile.personalContext, advisorContext: userProfile.advisorContext } : undefined,
    target: { alias: target.alias, fullName: target.fullName, location: target.location, relationshipContext: target.relationshipContext, summary: target.summary },
    story: [...target.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    importantMemory: { facts: target.facts, signals: target.signals, emotionState: target.emotionState }, risks: target.risks.filter((item) => item.status === "open"), openLoops: target.openLoops.filter((item) => item.status === "open"), advisorTask,
  };
}

export function casePacketToMarkdown(packet: RyanCasePacket): string {
  const bullets = (items: { text?: string; summary?: string }[]) => items.length ? items.map((item) => `- ${item.text ?? item.summary ?? ""}`).join("\n") : "- None recorded.";
  const user = packet.userContext
    ? [
        packet.userContext.name ? `- Name/context label: ${packet.userContext.name}` : undefined,
        packet.userContext.preferredName ? `- Preferred name: ${packet.userContext.preferredName}` : undefined,
        packet.userContext.relationshipGoals ? `- Relationship goal: ${packet.userContext.relationshipGoals}` : undefined,
        packet.userContext.personalContext ? `- More context: ${packet.userContext.personalContext}` : undefined,
        packet.userContext.advisorContext ? `- Notes to remember: ${packet.userContext.advisorContext}` : undefined,
      ].filter(Boolean).join("\n")
    : "- User capsule intentionally omitted.";

  return `# Ryan Case Packet: ${packet.target.alias}\n\nSchema version: ${packet.schemaVersion}\nGenerated: ${packet.generatedAt}\n\n## User capsule\n${user}\n\n## Target capsule\n- Alias: ${packet.target.alias}\n${packet.target.fullName ? `- Known name: ${packet.target.fullName}\n` : ""}${packet.target.location ? `- Location/context: ${packet.target.location}\n` : ""}${packet.target.relationshipContext ? `- Relationship context: ${packet.target.relationshipContext}\n` : ""}- Summary: ${packet.target.summary}\n\n## Story so far\n${bullets(packet.story)}\n\n## Important memory\n${bullets(packet.importantMemory.facts)}\n\n## Signals\n${bullets(packet.importantMemory.signals)}\n\n## Emotions\n${bullets(packet.importantMemory.emotionState)}\n\n## Risks / open loops\n### Risks\n${bullets(packet.risks)}\n\n### Open loops\n${bullets(packet.openLoops)}\n\n## Advisor task template\n${packet.advisorTask}\n`;
}
