import type { AiProvider } from "./aiProvider";

/** Reserved integration seam. Phase 1 deliberately makes no remote requests. */
export const openRouterProvider: AiProvider = {
  id: "openrouter-placeholder", label: "OpenRouter (not configured)",
  async extract() { throw new Error("OpenRouter is not enabled in the local-only Phase 1 MVP."); },
};
