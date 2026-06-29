import type { MemoryPacket, RawReport, TargetContainer } from "../schema";
import type { AIProviderConfig, AISettings, AiProviderType } from "./aiSettings";
import { extractMemoryPacket } from "../memory/extractor";
import {
  AIProviderError,
  type FetchLike,
  testOpenAICompatibleProvider,
  extractWithOpenAICompatibleProvider,
} from "./providers/openAICompatibleProvider";
import { extractWithGeminiProvider, testGeminiProvider } from "./providers/geminiProvider";
import { extractWithOpenRouterProvider, testOpenRouterProvider } from "./providers/openRouterProvider";

export interface ProviderRuntime {
  type: AiProviderType;
  label: string;
  requiresKey: boolean;
  extract(report: RawReport, target: TargetContainer, provider: AIProviderConfig, settings: AISettings, fetcher?: FetchLike): Promise<MemoryPacket>;
  test(provider: AIProviderConfig, settings: AISettings, fetcher?: FetchLike): Promise<string>;
}

const optionsFrom = (settings: AISettings, fetcher?: FetchLike) => ({
  temperature: settings.advanced.temperature,
  maxTokens: settings.advanced.maxTokens,
  timeoutMs: settings.advanced.timeoutMs,
  fetcher,
});

export const providerRegistry: Record<AiProviderType, ProviderRuntime> = {
  local: {
    type: "local",
    label: "Local heuristic",
    requiresKey: false,
    extract: async (report, target) => extractMemoryPacket(report, target),
    test: async () => "Local heuristic is always available.",
  },
  gemini: {
    type: "gemini",
    label: "Gemini API",
    requiresKey: true,
    extract: async (report, target, provider, settings, fetcher) => extractWithGeminiProvider(report, target, provider, optionsFrom(settings, fetcher)),
    test: async (provider, settings, fetcher) => testGeminiProvider(provider, optionsFrom(settings, fetcher)),
  },
  openrouter: {
    type: "openrouter",
    label: "OpenRouter",
    requiresKey: true,
    extract: async (report, target, provider, settings, fetcher) => extractWithOpenRouterProvider(report, target, provider, optionsFrom(settings, fetcher)),
    test: async (provider, settings, fetcher) => testOpenRouterProvider(provider, optionsFrom(settings, fetcher)),
  },
  "openai-compatible": {
    type: "openai-compatible",
    label: "OpenAI-compatible custom",
    requiresKey: true,
    extract: async (report, target, provider, settings, fetcher) => extractWithOpenAICompatibleProvider(report, target, provider, optionsFrom(settings, fetcher)),
    test: async (provider, settings, fetcher) => testOpenAICompatibleProvider(provider, optionsFrom(settings, fetcher)),
  },
};

export const providerErrorStatus = (error: unknown) => error instanceof AIProviderError ? error.status : "failed";
export const providerErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Provider failed.";
