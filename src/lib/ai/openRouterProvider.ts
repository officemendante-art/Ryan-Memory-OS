import {
  type Confidence,
  type ExtractedEmotion,
  type ExtractedFact,
  type ExtractedOpenLoop,
  type ExtractedRisk,
  type ExtractedSignal,
  type FactCategory,
  type MemoryPacket,
  type RawReport,
  type SignalDirection,
  type TargetContainer,
  newId,
  nowIso,
} from "../schema";
import type { AiProvider } from "./aiProvider";
import { DEFAULT_AI_SETTINGS, getEffectiveOpenRouterApiKey, type AiSettings } from "./settings";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const confidenceValues: Confidence[] = ["low", "medium", "high"];
const factCategories: FactCategory[] = ["preference", "identity", "detail", "boundary"];
const signalDirections: SignalDirection[] = ["positive", "negative", "mixed", "neutral"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown, fallback = ""): string => typeof value === "string" ? value.trim() : fallback;
const clip = (text: string, max = 360): string => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
const confidence = (value: unknown): Confidence => confidenceValues.includes(value as Confidence) ? value as Confidence : "low";
const factCategory = (value: unknown): FactCategory => factCategories.includes(value as FactCategory) ? value as FactCategory : "detail";
const signalDirection = (value: unknown): SignalDirection => signalDirections.includes(value as SignalDirection) ? value as SignalDirection : "neutral";

function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`AI response was not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

const mapArray = <T>(value: unknown, mapper: (item: Record<string, unknown>) => T | undefined): T[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isRecord(item) ? [mapper(item)].filter((mapped): mapped is T => !!mapped) : []);
};

export function validateAiMemoryPacket(input: unknown, report: RawReport, target: TargetContainer): MemoryPacket {
  if (!isRecord(input)) throw new Error("AI JSON must be an object.");

  const facts = mapArray<ExtractedFact>(input.facts, (item) => {
    const text = asString(item.text);
    if (!text) return undefined;
    return { text: clip(text), category: factCategory(item.category), confidence: confidence(item.confidence) };
  });

  const signals = mapArray<ExtractedSignal>(input.signals, (item) => {
    const text = asString(item.text);
    if (!text) return undefined;
    return { text: clip(text), direction: signalDirection(item.direction), confidence: confidence(item.confidence) };
  });

  const emotions = mapArray<ExtractedEmotion>(input.emotions, (item) => {
    const text = asString(item.text);
    const label = asString(item.label, "unknown");
    if (!text) return undefined;
    return { label: clip(label, 40).toLowerCase(), text: clip(text), confidence: confidence(item.confidence) };
  });

  const risks = mapArray<ExtractedRisk>(input.risks, (item) => {
    const text = asString(item.text);
    if (!text) return undefined;
    return { text: clip(text), confidence: confidence(item.confidence) };
  });

  const openLoops = mapArray<ExtractedOpenLoop>(input.openLoops, (item) => {
    const text = asString(item.text);
    return text ? { text: clip(text) } : undefined;
  });

  const patternHints = Array.isArray(input.patternHints)
    ? input.patternHints.map((item) => typeof item === "string" ? clip(item) : isRecord(item) ? clip(asString(item.text)) : "").filter(Boolean)
    : [];

  const timestamp = nowIso();
  const rawSummary = clip(asString(input.rawSummary, report.content.replace(/\s+/g, " ")), 420);
  const compressedUpdate = clip(asString(input.compressedUpdate, [facts[0]?.text, risks[0]?.text, openLoops[0]?.text].filter(Boolean).join(" ") || rawSummary), 520);
  const allConfidentItems = [...facts, ...signals, ...emotions, ...risks];
  const packetConfidence = confidence(input.confidence);
  const needsHumanReview = typeof input.needsHumanReview === "boolean"
    ? input.needsHumanReview
    : true;

  return {
    id: newId(),
    reportId: report.id,
    targetId: target.id,
    identity: { targetAlias: target.alias, reportType: report.type, occurredAt: report.occurredAt },
    rawSummary,
    facts,
    signals,
    emotions,
    risks,
    openLoops,
    patternHints,
    compressedUpdate,
    confidence: allConfidentItems.some((item) => item.confidence === "low") ? "low" : packetConfidence,
    needsHumanReview,
    createdAt: timestamp,
    lastUpdated: timestamp,
  };
}

const extractionSystemPrompt = `You are Ryan Memory OS extraction worker.
You are not an advisor.
You do not give relationship advice.
You do not write messages to the target.
You do not manipulate, score, or judge people.
You only extract structured memory from the user's report.
Do not invent facts.
Every extracted item must be grounded in the input.
If uncertain, mark confidence low and needsHumanReview true.
Return valid JSON only. No markdown.

Required JSON shape:
{
  "rawSummary": "brief factual summary",
  "facts": [{"text":"grounded fact","category":"preference|identity|detail|boundary","confidence":"low|medium|high"}],
  "signals": [{"text":"grounded signal","direction":"positive|negative|mixed|neutral","confidence":"low|medium|high"}],
  "emotions": [{"label":"emotion label","text":"grounded evidence","confidence":"low|medium|high"}],
  "risks": [{"text":"grounded risk or friction","confidence":"low|medium|high"}],
  "openLoops": [{"text":"unanswered question or follow-up needed"}],
  "patternHints": ["possible repeated pattern only if explicitly supported"],
  "compressedUpdate": "short memory update grounded in the report",
  "confidence": "low|medium|high",
  "needsHumanReview": true
}`;

function userPrompt(report: RawReport, target: TargetContainer): string {
  return JSON.stringify({
    target: {
      alias: target.alias,
      summary: target.summary,
      knownFacts: target.facts.slice(-12).map((fact) => fact.text),
      openLoops: target.openLoops.filter((loop) => loop.status === "open").slice(-8).map((loop) => loop.text),
    },
    report: {
      id: report.id,
      type: report.type,
      occurredAt: report.occurredAt,
      title: report.title,
      content: report.content,
    },
  }, null, 2);
}

async function callOpenRouter(report: RawReport, target: TargetContainer, settings: AiSettings, fetcher: FetchLike): Promise<string> {
  const apiKey = getEffectiveOpenRouterApiKey(settings);
  if (!apiKey) throw new Error("OpenRouter API key is not configured.");
  const response = await fetcher(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "Ryan Memory OS",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_AI_SETTINGS.model,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: extractionSystemPrompt },
        { role: "user", content: userPrompt(report, target) },
      ],
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${response.status}): ${clip(errorText, 240) || response.statusText}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no message content.");
  return content;
}

export async function extractMemoryWithOpenRouter(
  report: RawReport,
  target: TargetContainer,
  settings: AiSettings,
  fetcher: FetchLike = fetch,
): Promise<MemoryPacket> {
  const content = await callOpenRouter(report, target, settings, fetcher);
  return validateAiMemoryPacket(parseModelJson(content), report, target);
}

export async function testOpenRouterConnection(settings: AiSettings, fetcher: FetchLike = fetch): Promise<string> {
  const apiKey = getEffectiveOpenRouterApiKey(settings);
  if (!apiKey) throw new Error("OpenRouter API key is not configured.");
  const response = await fetcher(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "Ryan Memory OS",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_AI_SETTINGS.model,
      temperature: 0,
      max_tokens: 30,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: "{\"status\":\"ok\"}" },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter test failed (${response.status}).`);
  return "Connected to OpenRouter.";
}

export const openRouterProvider: AiProvider = {
  id: "openrouter",
  label: "OpenRouter",
  extract: async (report, target, settings = DEFAULT_AI_SETTINGS) => extractMemoryWithOpenRouter(report, target, settings),
};
