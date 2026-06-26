import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addTarget, db, exportTargetBundle, importTargetBundle, saveReport } from '../db/storage'
import { extractMemoryPacket } from './extractor'
import { mergeMemoryPacket } from './merge'
import { casePacketToMarkdown, generateRyanCasePacket } from './packetGenerator'
import { createTarget, newId, nowIso, type RawReport, type UserProfile } from '../schema'

const report = (targetId: string, content: string, type: RawReport['type'] = 'conversation_update'): RawReport => {
  const stamp = nowIso()
  return { id: newId(), targetId, content, type, occurredAt: '2026-06-26', createdAt: stamp, lastUpdated: stamp }
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
})

describe('Ryan Memory OS local memory pipeline', () => {
  it('creates an empty target container safely', () => {
    const target = createTarget('Aditi')
    expect(target.alias).toBe('Aditi')
    expect(target.events).toEqual([])
    expect(target.facts).toEqual([])
  })

  it('adds an extracted memory packet and deduplicates the same stated fact', () => {
    let target = createTarget('Aditi')
    const first = report(target.id, 'Aditi likes singing also.')
    target = mergeMemoryPacket(target, first, extractMemoryPacket(first, target))
    const repeat = report(target.id, 'Aditi likes singing also.')
    target = mergeMemoryPacket(target, repeat, extractMemoryPacket(repeat, target))
    expect(target.facts).toHaveLength(1)
    expect(target.facts[0].sourceReportIds).toContain(first.id)
    expect(target.facts[0].sourceReportIds).toContain(repeat.id)
    expect(target.events).toHaveLength(2)
  })

  it('turns a conflict report into a reviewable risk and open loop', () => {
    let target = createTarget('Aditi')
    const conflict = report(target.id, "Yesterday we argued. She said I don't listen properly and got cold.", 'conflict')
    target = mergeMemoryPacket(target, conflict, extractMemoryPacket(conflict, target))
    expect(target.risks.length).toBeGreaterThan(0)
    expect(target.openLoops.length).toBeGreaterThan(0)
  })

  it('generates a case packet with user context, target story, and saved fact', () => {
    let target = createTarget('Aditi')
    const source = report(target.id, 'Aditi likes singing and she laughed warmly.')
    target = mergeMemoryPacket(target, source, extractMemoryPacket(source, target))
    const user: UserProfile = { id: 'primary', name: 'Ryan', relationshipGoals: 'Build connection slowly.', createdAt: nowIso(), lastUpdated: nowIso() }
    const packet = generateRyanCasePacket(target, user)
    expect(packet.userContext?.name).toBe('Ryan')
    expect(packet.target.alias).toBe('Aditi')
    expect(packet.story).toHaveLength(1)
    expect(casePacketToMarkdown(packet)).toContain('likes singing')
  })

  it('exports and imports a target bundle into a clean IndexedDB state', async () => {
    const target = await addTarget('Aditi')
    const source = report(target.id, 'Aditi likes singing.')
    await saveReport(source)
    const merged = mergeMemoryPacket(target, source, extractMemoryPacket(source, target))
    await db.targets.put(merged)
    const bundle = await exportTargetBundle(target.id)
    await db.targets.clear(); await db.reports.clear(); await db.packets.clear()
    const imported = await importTargetBundle(JSON.stringify(bundle))
    const importedReports = await db.reports.where('targetId').equals(imported.id).toArray()
    expect(imported.id).not.toBe(target.id)
    expect(imported.alias).toBe('Aditi')
    expect(importedReports).toHaveLength(1)
  })
})
