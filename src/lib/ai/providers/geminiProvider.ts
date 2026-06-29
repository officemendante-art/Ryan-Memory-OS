import type { MemoryPacket, RawReport, TargetContainer } from "../../schema";
import { type AIProviderConfig, getEffectiveApiKey } from "../aiSettings";
import {
  AIProviderError,
  type FetchLike,
  clip,
  extractionSystemPrompt,
  fetchWithTimeout,
  parseModelJson,
  reportUserPrompt,
  statusFromHttp,
  validateAiMemoryPacket,
} from "./openAICompatibleProvider";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const geminiUrl = (provider: AIProviderConfig, apiKey: string) => {
  const model = encodeURIComponent(provider.model.trim());
  return `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
};

function extractGeminiText(data: unknown): string {
  const candidate = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new AIProviderError("Gemini returned no text content.");
  return text;
}

export async function extractWithGeminiProvider(
  report: RawReport,
  target: TargetContainer,
  provider: AIProviderConfig,
  options: { temperature: number; maxTokens: number; timeoutMs: number; fetcher?: FetchLike },
): Promise<MemoryPacket> {
  const apiKey = getEffectiveApiKey(provider);
  if (!apiKey) throw new AIProviderError(`${provider.label} API key is not configured.`, "not_configured", false);
  if (!provider.model.trim()) throw new AIProviderError(`${provider.label} needs a model name.`, "not_configured", false);

  const response = await fetchWithTimeout(options.fetcher ?? fetch, geminiUrl(provider, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: extractionSystemPrompt }] },
      contents: [{ role: "user", parts: [{ text: reportUserPrompt(report, target) }] }],
      generationConfig: {
        temperature: provider.temperature ?? options.temperature,
        maxOutputTokens: provider.maxTokens ?? options.maxTokens,
        responseMimeType: "application/json",
      },
    }),
  }, provider.timeoutMs ?? options.timeoutMs);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new AIProviderError(`${provider.label} request failed (${response.status}): ${clip(errorText, 240) || response.statusText}`, statusFromHttp(response.status));
  }

  const data = await response.json();
  return validateAiMemoryPacket(parseModelJson(extractGeminiText(data)), report, target);
}

export async function testGeminiProvider(
  provider: AIProviderConfig,
  options: { temperature: number; maxTokens: number; timeoutMs: number; fetcher?: FetchLike },
): Promise<string> {
  const apiKey = getEffectiveApiKey(provider);
  if (!apiKey) throw new AIProviderError(`${provider.label} API key is not configured.`, "not_configured", false);
  const response = await fetchWithTimeout(options.fetcher ?? fetch, geminiUrl(provider, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Return {\"status\":\"ok\"} as JSON only." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 30, responseMimeType: "application/json" },
    }),
  }, provider.timeoutMs ?? options.timeoutMs);
  if (!response.ok) throw new AIProviderError(`${provider.label} test failed (${response.status}).`, statusFromHttp(response.status));
  return `${provider.label} connected.`;
}
