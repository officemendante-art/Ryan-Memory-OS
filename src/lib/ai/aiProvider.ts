import type { MemoryPacket, RawReport, TargetContainer } from "../schema";
import { extractMemoryPacket } from "../memory/extractor";

export interface AiProvider {
  readonly id: string;
  readonly label: string;
  extract(report: RawReport, target: TargetContainer): Promise<MemoryPacket>;
}

/** The default provider never sends data off-device. */
export const localExtractorProvider: AiProvider = {
  id: "local-deterministic", label: "Local deterministic extractor",
  extract: async (report, target) => extractMemoryPacket(report, target),
};
