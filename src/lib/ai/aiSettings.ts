export type AiProviderType = "local" | "gemini" | "openrouter" | "openai-compatible";
export type ExtractionMode = "local" | "ai" | "auto";
export type ProviderStatus = "not_configured" | "connected" | "failed" | "rate_limited";

export interface AIProviderConfig {
  id: string;
  enabled: boolean;
  label: string;
  type: AiProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  priority: number;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  lastStatus?: ProviderStatus;
  lastTestedAt?: string;
  lastMessage?: string;
}

export interface AISettings {
  schemaVersion: 1;
  defaultExtractionMode: ExtractionMode;
  providers: AIProviderConfig[];
  advanced: {
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    retries: number;
  };
  lastUpdated: string;
}

export type AiSettings = AISettings;
export type PublicAIProviderConfig = Omit<AIProviderConfig, "apiKey"> & { hasBrowserKey: boolean; hasEnvKey: boolean };
export type PublicAISettings = Omit<AISettings, "providers"> & { providers: PublicAIProviderConfig[] };

export const AI_SETTINGS_STORAGE_KEY = "ryan-memory-os-ai-settings";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash";
export const DEFAULT_CUSTOM_MODEL = "model-name";

const defaultAdvanced = {
  temperature: 0.1,
  maxTokens: 1600,
  timeoutMs: 30000,
  retries: 1,
};

const nowIso = () => new Date().toISOString();
const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const newProviderId = () => `provider-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export function providerTypeLabel(type: AiProviderType): string {
  return ({
    local: "Local heuristic",
    gemini: "Gemini API",
    openrouter: "OpenRouter",
    "openai-compatible": "OpenAI-compatible custom",
  })[type];
}

export function defaultModelForProvider(type: AiProviderType): string {
  if (type === "gemini") return DEFAULT_GEMINI_MODEL;
  if (type === "openrouter") return DEFAULT_OPENROUTER_MODEL;
  if (type === "openai-compatible") return DEFAULT_CUSTOM_MODEL;
  return "local-heuristic";
}

export function modelPresetsForProvider(type: AiProviderType): string[] {
  if (type === "gemini") return ["gemini-2.5-flash", "gemini-2.0-flash"];
  if (type === "openrouter") return ["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro", "google/gemini-flash"];
  return [];
}

export function createProviderConfig(type: AiProviderType, partial: Partial<AIProviderConfig> = {}): AIProviderConfig {
  const isLocal = type === "local";
  return {
    id: partial.id || (isLocal ? "local-heuristic" : newProviderId()),
    enabled: partial.enabled ?? true,
    label: partial.label?.trim() || providerTypeLabel(type),
    type,
    apiKey: partial.apiKey?.trim() || undefined,
    baseUrl: partial.baseUrl?.trim() || (type === "openrouter" ? "https://openrouter.ai/api/v1" : undefined),
    model: partial.model?.trim() || defaultModelForProvider(type),
    priority: Math.max(1, Math.round(Number(partial.priority) || 1)),
    temperature: partial.temperature,
    maxTokens: partial.maxTokens,
    timeoutMs: partial.timeoutMs,
    lastStatus: partial.lastStatus ?? (isLocal ? "connected" : "not_configured"),
    lastTestedAt: partial.lastTestedAt,
    lastMessage: partial.lastMessage,
  };
}

function normalizeProvider(input: Partial<AIProviderConfig>, index: number): AIProviderConfig | undefined {
  const type = input.type === "local" || input.type === "gemini" || input.type === "openrouter" || input.type === "openai-compatible" ? input.type : undefined;
  if (!type) return undefined;
  const normalized = createProviderConfig(type, {
    ...input,
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : index + 1,
  });
  if (type === "local") {
    normalized.id = "local-heuristic";
    normalized.label = "Local heuristic";
    normalized.enabled = true;
    normalized.apiKey = undefined;
    normalized.baseUrl = undefined;
    normalized.model = "local-heuristic";
    normalized.lastStatus = "connected";
  }
  if (type === "gemini") normalized.baseUrl = undefined;
  return normalized;
}

export function normalizeAiSettings(input: Partial<AISettings> | undefined): AISettings {
  const maybeProviders = Array.isArray(input?.providers) ? input.providers : [];
  const providers = maybeProviders
    .map((provider, index) => normalizeProvider(provider, index))
    .filter((provider): provider is AIProviderConfig => !!provider);

  if (!providers.some((provider) => provider.type === "local")) providers.push(createProviderConfig("local", { priority: 999 }));

  const sorted = providers
    .sort((a, b) => a.priority - b.priority)
    .map((provider, index) => ({ ...provider, priority: provider.type === "local" ? 999 : index + 1 }));

  const local = sorted.find((provider) => provider.type === "local") ?? createProviderConfig("local", { priority: 999 });
  const remoteProviders = sorted.filter((provider) => provider.type !== "local").map((provider, index) => ({ ...provider, priority: index + 1 }));

  const advancedInput: Partial<AISettings["advanced"]> = input?.advanced ?? {};
  return {
    schemaVersion: 1,
    defaultExtractionMode: input?.defaultExtractionMode === "ai" || input?.defaultExtractionMode === "auto" ? input.defaultExtractionMode : "local",
    providers: [...remoteProviders, { ...local, priority: remoteProviders.length + 1, enabled: true }],
    advanced: {
      temperature: clampNumber(advancedInput.temperature, defaultAdvanced.temperature, 0, 1),
      maxTokens: Math.round(clampNumber(advancedInput.maxTokens, defaultAdvanced.maxTokens, 200, 8000)),
      timeoutMs: Math.round(clampNumber(advancedInput.timeoutMs, defaultAdvanced.timeoutMs, 5000, 120000)),
      retries: Math.round(clampNumber(advancedInput.retries, defaultAdvanced.retries, 1, 3)),
    },
    lastUpdated: input?.lastUpdated || nowIso(),
  };
}

export const DEFAULT_AI_SETTINGS: AISettings = normalizeAiSettings({
  schemaVersion: 1,
  defaultExtractionMode: "local",
  providers: [createProviderConfig("local", { priority: 999 })],
  advanced: defaultAdvanced,
  lastUpdated: new Date(0).toISOString(),
});

function migrateLegacySettings(value: Record<string, unknown>): Partial<AISettings> {
  if ("providers" in value) return value as Partial<AISettings>;
  const apiKey = typeof value.apiKey === "string" ? value.apiKey : undefined;
  const provider = value.provider === "openrouter"
    ? createProviderConfig("openrouter", {
      apiKey,
      model: typeof value.model === "string" ? value.model : DEFAULT_OPENROUTER_MODEL,
      priority: 1,
      lastStatus: value.lastTestStatus === "connected" ? "connected" : value.lastTestStatus === "failed" ? "failed" : "not_configured",
      lastMessage: typeof value.lastTestMessage === "string" ? value.lastTestMessage : undefined,
    })
    : undefined;
  return {
    schemaVersion: 1,
    defaultExtractionMode: value.extractionMode === "ai" || value.extractionMode === "auto" ? value.extractionMode : "local",
    providers: provider ? [provider, createProviderConfig("local", { priority: 999 })] : [createProviderConfig("local", { priority: 999 })],
    advanced: {
      temperature: clampNumber(value.temperature, defaultAdvanced.temperature, 0, 1),
      maxTokens: Math.round(clampNumber(value.maxTokens, defaultAdvanced.maxTokens, 200, 8000)),
      timeoutMs: defaultAdvanced.timeoutMs,
      retries: defaultAdvanced.retries,
    },
  };
}

export function loadAiSettings(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): AISettings {
  if (!storage) return DEFAULT_AI_SETTINGS;
  const raw = storage.getItem(AI_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_AI_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeAiSettings(migrateLegacySettings(parsed));
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: Partial<AISettings>, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): AISettings {
  const saved = normalizeAiSettings({ ...settings, lastUpdated: nowIso() });
  storage?.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

export function clearAllAiKeys(settings: AISettings, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): AISettings {
  return saveAiSettings({
    ...settings,
    providers: settings.providers.map((provider) => ({
      ...provider,
      apiKey: undefined,
      lastStatus: provider.type === "local" ? "connected" : "not_configured",
      lastMessage: provider.type === "local" ? "Local heuristic is always available." : "Browser key cleared.",
    })),
  }, storage);
}

export function getEnvKeyForProvider(type: AiProviderType): string {
  if (type === "gemini") return import.meta.env.VITE_GEMINI_API_KEY?.trim?.() || "";
  if (type === "openrouter") return import.meta.env.VITE_OPENROUTER_API_KEY?.trim?.() || "";
  return "";
}

export function getEffectiveApiKey(provider: AIProviderConfig): string {
  return provider.apiKey?.trim() || getEnvKeyForProvider(provider.type);
}

export function publicAiSettings(settings: AISettings): PublicAISettings {
  return {
    ...settings,
    providers: settings.providers.map(({ apiKey, ...provider }) => ({
      ...provider,
      hasBrowserKey: !!apiKey?.trim(),
      hasEnvKey: !!getEnvKeyForProvider(provider.type),
    })),
  };
}

export function updateProvider(settings: AISettings, providerId: string, updater: (provider: AIProviderConfig) => AIProviderConfig): AISettings {
  return normalizeAiSettings({
    ...settings,
    providers: settings.providers.map((provider) => provider.id === providerId ? updater(provider) : provider),
  });
}

export function removeProvider(settings: AISettings, providerId: string): AISettings {
  return normalizeAiSettings({ ...settings, providers: settings.providers.filter((provider) => provider.id !== providerId || provider.type === "local") });
}

export function moveProvider(settings: AISettings, providerId: string, direction: -1 | 1): AISettings {
  const remotes = settings.providers.filter((provider) => provider.type !== "local");
  const index = remotes.findIndex((provider) => provider.id === providerId);
  if (index < 0) return settings;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= remotes.length) return settings;
  const next = [...remotes];
  const [provider] = next.splice(index, 1);
  next.splice(nextIndex, 0, provider);
  return normalizeAiSettings({ ...settings, providers: [...next, settings.providers.find((item) => item.type === "local")].filter(Boolean) as AIProviderConfig[] });
}
