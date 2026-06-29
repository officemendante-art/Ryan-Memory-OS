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
} from "../../schema";
import {
  type AIProviderConfig,
  type ProviderStatus,
  getEffectiveApiKey,
} from "../aiSettings";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class AIProviderError extends Error {
  status: ProviderStatus;
  retryable: boolean;

  constructor(message: string, status: ProviderStatus = "failed", retryable = true) {
    super(message);
    this.name = "AIProviderError";
    this.status = status;
    this.retryable = retryable;
  }
}

const confidenceValues: Confidence[] = ["low", "medium", "high"];
const factCategories: FactCategory[] = ["preference", "identity", "detail", "boundary"];
const signalDirections: SignalDirection[] = ["positive", "negative", "mixed", "neutral"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown, fallback = ""): string => typeof value === "string" ? value.trim() : fallback;
export const clip = (text: string, max = 360): string => text.length > max ? `${text.slice(0, max - 1).trimEnd()}...` : text;
const confidence = (value: unknown): Confidence => confidenceValues.includes(value as Confidence) ? value as Confidence : "low";
const factCategory = (value: unknown): FactCategory => factCategories.includes(value as FactCategory) ? value as FactCategory : "detail";
const signalDirection = (value: unknown): SignalDirection => signalDirections.includes(value as SignalDirection) ? value as SignalDirection : "neutral";

export function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new AIProviderError(`AI response was not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

const mapArray = <T>(value: unknown, mapper: (item: Record<string, unknown>) => T | undefined): T[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isRecord(item) ? [mapper(item)].filter((mapped): mapped is T => !!mapped) : []);
};

export function validateAiMemoryPacket(input: unknown, report: RawReport, target: TargetContainer): MemoryPacket {
  if (!isRecord(input)) throw new AIProviderError("AI JSON must be an object.");

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
  const needsHumanReview = typeof input.needsHumanReview === "boolean" ? input.needsHumanReview : true;

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

export const extractionSystemPrompt = `You are Ryan Memory OS extraction worker.
You are not an advisor.
You do not give dating or relationship advice.
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

export function reportUserPrompt(report: RawReport, target: TargetContainer): string {
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

export function buildProviderUrl(provider: AIProviderConfig, path: string): string {
  const baseUrl = provider.baseUrl?.trim();
  if (!baseUrl) throw new AIProviderError(`${provider.label} needs a base URL.`);
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function statusFromHttp(status: number): ProviderStatus {
  return status === 429 ? "rate_limited" : "failed";
}

export async function fetchWithTimeout(fetcher: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new AIProviderError("Provider request timed out.");
    throw new AIProviderError(error instanceof Error ? error.message : "Provider request failed.");
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function extractWithOpenAICompatibleProvider(
  report: RawReport,
  target: TargetContainer,
  provider: AIProviderConfig,
  options: { temperature: number; maxTokens: number; timeoutMs: number; fetcher?: FetchLike },
): Promise<MemoryPacket> {
  const apiKey = getEffectiveApiKey(provider);
  if (!apiKey) throw new AIProviderError(`${provider.label} API key is not configured.`, "not_configured", false);
  if (!provider.model.trim()) throw new AIProviderError(`${provider.label} needs a model name.`, "not_configured", false);

  const response = await fetchWithTimeout(options.fetcher ?? fetch, buildProviderUrl(provider, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "Ryan Memory OS",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: provider.temperature ?? options.temperature,
      max_tokens: provider.maxTokens ?? options.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: extractionSystemPrompt },
        { role: "user", content: reportUserPrompt(report, target) },
      ],
    }),
  }, provider.timeoutMs ?? options.timeoutMs);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new AIProviderError(`${provider.label} request failed (${response.status}): ${clip(errorText, 240) || response.statusText}`, statusFromHttp(response.status));
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AIProviderError(`${provider.label} returned no message content.`);
  return validateAiMemoryPacket(parseModelJson(content), report, target);
}

export async function testOpenAICompatibleProvider(
  provider: AIProviderConfig,
  options: { temperature: number; maxTokens: number; timeoutMs: number; fetcher?: FetchLike },
): Promise<string> {
  const apiKey = getEffectiveApiKey(provider);
  if (!apiKey) throw new AIProviderError(`${provider.label} API key is not configured.`, "not_configured", false);
  const response = await fetchWithTimeout(options.fetcher ?? fetch, buildProviderUrl(provider, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "Ryan Memory OS",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0,
      max_tokens: 30,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: "{\"status\":\"ok\"}" },
      ],
    }),
  }, provider.timeoutMs ?? options.timeoutMs);
  if (!response.ok) throw new AIProviderError(`${provider.label} test failed (${response.status}).`, statusFromHttp(response.status));
  return `${provider.label} connected.`;
}
