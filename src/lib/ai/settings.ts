export type AiProviderId = "local" | "openrouter";
export type ExtractionMode = "local" | "ai" | "auto";

export interface AiSettings {
  provider: AiProviderId;
  extractionMode: ExtractionMode;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  lastTestStatus?: "connected" | "failed" | "not_configured";
  lastTestMessage?: string;
  lastUpdated: string;
}

export type PublicAiSettings = Omit<AiSettings, "apiKey"> & { hasBrowserKey: boolean; hasEnvKey: boolean };

const STORAGE_KEY = "ryan-memory-os-ai-settings";

export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash";
export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "local",
  extractionMode: "local",
  model: DEFAULT_OPENROUTER_MODEL,
  temperature: 0.1,
  maxTokens: 1600,
  lastTestStatus: "not_configured",
  lastUpdated: new Date(0).toISOString(),
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const envOpenRouterKey = (): string => {
  try {
    return (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim() ?? "";
  } catch {
    return "";
  }
};

export function normalizeAiSettings(input: Partial<AiSettings> | undefined): AiSettings {
  const provider: AiProviderId = input?.provider === "openrouter" ? "openrouter" : "local";
  const extractionMode: ExtractionMode = input?.extractionMode === "ai" || input?.extractionMode === "auto" ? input.extractionMode : "local";
  return {
    ...DEFAULT_AI_SETTINGS,
    ...input,
    provider,
    extractionMode,
    apiKey: input?.apiKey?.trim() || undefined,
    model: input?.model?.trim() || DEFAULT_OPENROUTER_MODEL,
    temperature: clampNumber(input?.temperature, DEFAULT_AI_SETTINGS.temperature, 0, 1),
    maxTokens: Math.round(clampNumber(input?.maxTokens, DEFAULT_AI_SETTINGS.maxTokens, 200, 8000)),
    lastUpdated: input?.lastUpdated || new Date().toISOString(),
  };
}

export function loadAiSettings(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): AiSettings {
  if (!storage) return normalizeAiSettings(undefined);
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return normalizeAiSettings(undefined);
  try {
    return normalizeAiSettings(JSON.parse(raw) as Partial<AiSettings>);
  } catch {
    return normalizeAiSettings(undefined);
  }
}

export function saveAiSettings(settings: Partial<AiSettings>, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): AiSettings {
  const saved = normalizeAiSettings({ ...settings, lastUpdated: new Date().toISOString() });
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

export function clearAiApiKey(settings: AiSettings, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): AiSettings {
  return saveAiSettings({ ...settings, apiKey: undefined, lastTestStatus: "not_configured", lastTestMessage: "Browser key cleared." }, storage);
}

export function getEffectiveOpenRouterApiKey(settings: AiSettings): string {
  return settings.apiKey?.trim() || envOpenRouterKey();
}

export function publicAiSettings(settings: AiSettings): PublicAiSettings {
  const { apiKey: _apiKey, ...rest } = settings;
  return { ...rest, hasBrowserKey: !!settings.apiKey?.trim(), hasEnvKey: !!envOpenRouterKey() };
}

export { STORAGE_KEY as AI_SETTINGS_STORAGE_KEY };
