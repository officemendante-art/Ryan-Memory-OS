import type { TargetContainer } from "../schema";

const takeTexts = <T extends { text: string; lastUpdated: string }>(items: T[], maximum: number): string[] =>
  items.slice().sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated)).slice(0, maximum).map((item) => item.text);

/** A compact, intentionally factual target capsule suitable for in-app display. */
export function compressTarget(target: TargetContainer): string {
  const parts: string[] = [];
  if (target.facts.length) parts.push(`Known: ${takeTexts(target.facts, 3).join("; ")}.`);
  if (target.signals.length) parts.push(`Recent signals: ${takeTexts(target.signals, 2).join("; ")}.`);
  const openRisks = target.risks.filter((risk) => risk.status === "open");
  if (openRisks.length) parts.push(`Watch: ${takeTexts(openRisks, 2).join("; ")}.`);
  const loops = target.openLoops.filter((loop) => loop.status === "open");
  if (loops.length) parts.push(`Open: ${takeTexts(loops, 2).join("; ")}.`);
  return parts.join(" ") || "No reviewed memory yet.";
}
