import type { MemoryPacket, RawReport, TargetContainer } from "../../schema";
import type { AIProviderConfig } from "../aiSettings";
import {
  type FetchLike,
  extractWithOpenAICompatibleProvider,
  testOpenAICompatibleProvider,
} from "./openAICompatibleProvider";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const withOpenRouterDefaults = (provider: AIProviderConfig): AIProviderConfig => ({
  ...provider,
  baseUrl: provider.baseUrl?.trim() || OPENROUTER_BASE_URL,
});

export async function extractWithOpenRouterProvider(
  report: RawReport,
  target: TargetContainer,
  provider: AIProviderConfig,
  options: { temperature: number; maxTokens: number; timeoutMs: number; fetcher?: FetchLike },
): Promise<MemoryPacket> {
  return extractWithOpenAICompatibleProvider(report, target, withOpenRouterDefaults(provider), options);
}

export async function testOpenRouterProvider(
  provider: AIProviderConfig,
  options: { temperature: number; maxTokens: number; timeoutMs: number; fetcher?: FetchLike },
): Promise<string> {
  return testOpenAICompatibleProvider(withOpenRouterDefaults(provider), options);
}
