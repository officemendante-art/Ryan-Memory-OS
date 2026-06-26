import type { MemoryPacket, RawReport, TargetContainer } from "./schema";
import { createTarget, newId, nowIso } from "./schema";
import { extractMemoryPacket } from "./memory/extractor";
import { mergeMemoryPacket } from "./memory/merge";
import { db } from "./db/storage";

export interface DemoSeed {
  target: TargetContainer;
  reports: RawReport[];
  packets: MemoryPacket[];
}

/** Creates data only; callers can show a confirmation dialog before persisting it. */
export function createAditiDemoSeed(): DemoSeed {
  const timestamp = nowIso();
  let target = createTarget("Aditi", {
    location: "Mumbai",
    relationshipContext: "Demo target for exploring the local memory workflow.",
    metadata: { isDemo: true, source: "demo" },
  });
  const report: RawReport = {
    id: newId(), targetId: target.id, occurredAt: timestamp, type: "conversation",
    title: "Coffee conversation", content: "Aditi said she likes singing and enjoys old Bollywood music. She seemed warm and laughed often.",
    createdAt: timestamp, lastUpdated: timestamp, metadata: { isDemo: true, source: "demo" },
  };
  const packet = extractMemoryPacket(report, target);
  packet.metadata = { isDemo: true, source: "demo" };
  target = mergeMemoryPacket(target, report, packet);
  target.metadata = { isDemo: true, source: "demo" };
  return { target, reports: [report], packets: [packet] };
}

/** Idempotent demo loader: it never creates a second Aditi demo target. */
export async function loadDemoData(): Promise<DemoSeed> {
  const existing = await db.targets.filter((target) => target.metadata?.isDemo === true && target.alias === "Aditi").first();
  if (existing) {
    const [reports, packets] = await Promise.all([db.reports.where("targetId").equals(existing.id).toArray(), db.packets.where("targetId").equals(existing.id).toArray()]);
    return { target: existing, reports, packets };
  }
  const seed = createAditiDemoSeed();
  await db.transaction("rw", db.targets, db.reports, db.packets, async () => {
    await db.targets.add(seed.target);
    await db.reports.bulkAdd(seed.reports);
    await db.packets.bulkAdd(seed.packets);
  });
  return seed;
}
