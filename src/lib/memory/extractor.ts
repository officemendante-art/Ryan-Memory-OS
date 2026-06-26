import {
  type Confidence, type ExtractedEmotion, type ExtractedFact, type ExtractedOpenLoop, type ExtractedRisk,
  type ExtractedSignal, type MemoryPacket, type RawReport, type TargetContainer, newId, nowIso,
} from "../schema";

const sentences = (input: string): string[] => input.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
const confidenceFor = (text: string): Confidence => /\b(always|definitely|clearly|explicitly)\b/i.test(text) ? "high" : /\b(maybe|seems|might|possibly|not sure)\b/i.test(text) ? "low" : "medium";

const statedPreference = (sentence: string): string | undefined => {
  const match = sentence.match(/\b(likes?|loves?|enjoys?|prefers?)\s+([^.!?,;]+)/i);
  if (match) {
    const object = match[2].replace(/\b(also|too)\b/gi, '').split(/\s+(?:and|but)\s+/i)[0].trim();
    return object ? `${match[1].toLowerCase()} ${object}` : undefined;
  }
  const favorite = sentence.match(/\bfavo(?:u)?rite\s+([^.!?,;]+)/i);
  return favorite ? `favorite ${favorite[1].trim()}` : undefined;
};

const statedDislike = (sentence: string): string | undefined => {
  const match = sentence.match(/\b(dislikes?|hates?|doesn't like|does not like|avoid(?:s|ed|ing)?)\s+([^.!?,;]+)/i);
  return match ? `${match[1].toLowerCase()} ${match[2].trim().split(/\s+(?:and|but)\s+/i)[0]}` : undefined;
};
const clip = (text: string, max = 180): string => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * Deliberately small, transparent extraction rules. Results remain reviewable
 * rather than presenting inference as truth.
 */
export function extractMemoryPacket(report: RawReport, target: TargetContainer): MemoryPacket {
  const facts: ExtractedFact[] = [];
  const signals: ExtractedSignal[] = [];
  const emotions: ExtractedEmotion[] = [];
  const risks: ExtractedRisk[] = [];
  const openLoops: ExtractedOpenLoop[] = [];
  const hints: string[] = [];
  for (const sentence of sentences(report.content)) {
    const confidence = confidenceFor(sentence);
    const preference = statedPreference(sentence);
    if (preference) facts.push({ text: clip(preference), category: "preference", confidence });
    if (/\b(is|works? as|studies|lives? in|from)\b/i.test(sentence) && !/\b(it is|this is)\b/i.test(sentence)) facts.push({ text: clip(sentence), category: "identity", confidence });
    const dislike = statedDislike(sentence);
    if (dislike) facts.push({ text: clip(dislike), category: "boundary", confidence });
    else if (/\b(uncomfortable|boundary)\b/i.test(sentence)) facts.push({ text: clip(sentence), category: "boundary", confidence });
    if (/\b(warm|engaged|responsive|laughed|smiled|asked me|replied warmly|continued|initiated|interested|appreciated|positive)\b/i.test(sentence)) signals.push({ text: clip(sentence), direction: "positive", confidence });
    if (/\b(cold|distant|dry reply|ignored|left on seen|short reply|cancelled|canceled|withdrew|negative|unresponsive)\b/i.test(sentence)) signals.push({ text: clip(sentence), direction: "negative", confidence });
    const emotion = sentence.match(/\b(warm|cold|happy|excited|nervous|sad|upset|angry|confused|frustrated|anxious|comfortable|uncomfortable)\b/i);
    if (emotion) emotions.push({ label: emotion[1].toLowerCase(), text: clip(sentence), confidence });
    if (/\b(conflict|argument|argued|fight|angry|cold|upset|hurt|disrespect|lied|jealous|pressure|red flag|misunderstanding)\b/i.test(sentence)) risks.push({ text: clip(sentence), confidence });
    if (/\b(she asked|i promised|need to reply|not answered|need to|needs to|should|follow up|check in|waiting for|hasn't|has not|unclear|unsure)\b/i.test(sentence)) openLoops.push({ text: clip(sentence) });
    if (/\b(always|usually|tends to|pattern)\b/i.test(sentence)) hints.push(clip(sentence));
  }
  const all = [...facts, ...signals, ...emotions, ...risks];
  const needsHumanReview = all.length === 0 || all.some((item) => item.confidence === "low") || report.type === "conflict";
  const confidence: Confidence = all.some((item) => item.confidence === "low") ? "low" : all.length ? "medium" : "low";
  const timestamp = nowIso();
  return {
    id: newId(), reportId: report.id, targetId: target.id,
    identity: { targetAlias: target.alias, reportType: report.type, occurredAt: report.occurredAt },
    rawSummary: clip(report.content.replace(/\s+/g, " "), 280), facts, signals, emotions, risks, openLoops,
    patternHints: hints, compressedUpdate: [facts[0]?.text, risks[0]?.text, openLoops[0]?.text].filter(Boolean).join(" ") || "No deterministic memory found; review raw report.",
    confidence, needsHumanReview, createdAt: timestamp, lastUpdated: timestamp,
  };
}
