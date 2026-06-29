import type { MemoryPacket, RawReport, TargetContainer } from "../schema";
import {
  type AIProviderConfig,
  type AISettings,
  type ProviderStatus,
  getEffectiveApiKey,
  normalizeAiSettings,
} from "./aiSettings";
import { providerErrorMessage, providerErrorStatus, providerRegistry } from "./providerRegistry";
import type { FetchLike } from "./providers/openAICompatibleProvider";

export interface AIRouteAttempt {
  providerId: string;
  label: string;
  type: AIProviderConfig["type"];
  status: ProviderStatus;
  message: string;
}

export interface AIRouterResult {
  packet: MemoryPacket;
  sourceLabel: string;
  usedLocalFallback: boolean;
  attempts: AIRouteAttempt[];
}

export function routeProviders(settings: AISettings): AIProviderConfig[] {
  return normalizeAiSettings(settings).providers
    .filter((provider) => provider.type !== "local" && provider.enabled)
    .filter((provider) => !!provider.model.trim())
    .sort((a, b) => a.priority - b.priority);
}

export function describeRoute(settings: AISettings): string[] {
  const normalized = normalizeAiSettings(settings);
  return normalized.providers
    .filter((provider) => provider.enabled || provider.type === "local")
    .sort((a, b) => a.priority - b.priority)
    .map((provider) => provider.label);
}

export function configuredRemoteProviders(settings: AISettings): AIProviderConfig[] {
  return routeProviders(settings).filter((provider) => !providerRegistry[provider.type].requiresKey || !!getEffectiveApiKey(provider));
}

async function tryRemoteProviders(
  report: RawReport,
  target: TargetContainer,
  settings: AISettings,
  fetcher?: FetchLike,
): Promise<{ packet?: MemoryPacket; provider?: AIProviderConfig; attempts: AIRouteAttempt[] }> {
  const attempts: AIRouteAttempt[] = [];
  for (const provider of routeProviders(settings)) {
    const runtime = providerRegistry[provider.type];
    if (runtime.requiresKey && !getEffectiveApiKey(provider)) {
      attempts.push({ providerId: provider.id, label: provider.label, type: provider.type, status: "not_configured", message: "API key is not configured." });
      continue;
    }

    const tries = Math.max(1, settings.advanced.retries);
    for (let attemptNumber = 1; attemptNumber <= tries; attemptNumber += 1) {
      try {
        const packet = await runtime.extract(report, target, provider, settings, fetcher);
        attempts.push({ providerId: provider.id, label: provider.label, type: provider.type, status: "connected", message: `Extraction succeeded${attemptNumber > 1 ? ` on attempt ${attemptNumber}` : ""}.` });
        return { packet, provider, attempts };
      } catch (error) {
        const status = providerErrorStatus(error);
        attempts.push({ providerId: provider.id, label: provider.label, type: provider.type, status, message: providerErrorMessage(error) });
        if (status === "not_configured" || status === "rate_limited") break;
      }
    }
  }
  return { attempts };
}

export async function extractWithAiRouter(
  report: RawReport,
  target: TargetContainer,
  settingsInput: AISettings,
  fetcher?: FetchLike,
): Promise<AIRouterResult> {
  const settings = normalizeAiSettings(settingsInput);
  const local = settings.providers.find((provider) => provider.type === "local")!;
  const localRuntime = providerRegistry.local;

  if (settings.defaultExtractionMode === "local") {
    return {
      packet: await localRuntime.extract(report, target, local, settings, fetcher),
      sourceLabel: "local heuristic",
      usedLocalFallback: false,
      attempts: [],
    };
  }

  const remote = await tryRemoteProviders(report, target, settings, fetcher);
  if (remote.packet && remote.provider) {
    return {
      packet: remote.packet,
      sourceLabel: `${remote.provider.label} - ${remote.provider.model}`,
      usedLocalFallback: false,
      attempts: remote.attempts,
    };
  }

  if (settings.defaultExtractionMode === "ai") {
    const reason = remote.attempts.length ? remote.attempts.map((attempt) => `${attempt.label}: ${attempt.message}`).join(" ") : "No enabled remote provider is configured.";
    throw new Error(`AI extraction failed. ${reason}`);
  }

  return {
    packet: await localRuntime.extract(report, target, local, settings, fetcher),
    sourceLabel: "local heuristic fallback",
    usedLocalFallback: true,
    attempts: remote.attempts,
  };
}

export async function testProvider(provider: AIProviderConfig, settings: AISettings, fetcher?: FetchLike): Promise<AIRouteAttempt> {
  try {
    const runtime = providerRegistry[provider.type];
    const message = await runtime.test(provider, normalizeAiSettings(settings), fetcher);
    return { providerId: provider.id, label: provider.label, type: provider.type, status: "connected", message };
  } catch (error) {
    return { providerId: provider.id, label: provider.label, type: provider.type, status: providerErrorStatus(error), message: providerErrorMessage(error) };
  }
}

export async function testAllProviders(settings: AISettings, fetcher?: FetchLike): Promise<AIRouteAttempt[]> {
  const normalized = normalizeAiSettings(settings);
  const providers = normalized.providers.filter((provider) => provider.type !== "local");
  if (!providers.length) return [await testProvider(normalized.providers.find((provider) => provider.type === "local")!, normalized, fetcher)];
  return Promise.all(providers.map((provider) => testProvider(provider, normalized, fetcher)));
}
