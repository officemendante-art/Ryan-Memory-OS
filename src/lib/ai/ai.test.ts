import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addTarget, db, exportWorkspace } from '../db/storage'
import { extractMemoryPacket } from '../memory/extractor'
import { createTarget, newId, nowIso, type RawReport } from '../schema'
import { extractMemoryWithOpenRouter, validateAiMemoryPacket } from './openRouterProvider'
import { clearAiApiKey, loadAiSettings, saveAiSettings } from './settings'

const report = (targetId: string, content = 'Aditi likes singing.'): RawReport => {
  const stamp = nowIso()
  return { id: newId(), targetId, content, type: 'conversation_update', occurredAt: '2026-06-27', createdAt: stamp, lastUpdated: stamp }
}

beforeEach(async () => {
  localStorage.clear()
  db.close()
  await db.delete()
  await db.open()
})

describe('Ryan Memory OS AI extraction safety', () => {
  it('saves and clears AI settings locally without losing non-key config', () => {
    const saved = saveAiSettings({ provider: 'openrouter', extractionMode: 'auto', apiKey: 'local-test-placeholder', model: 'deepseek/test', temperature: 0.1, maxTokens: 900 })
    expect(loadAiSettings().apiKey).toBe('local-test-placeholder')
    const cleared = clearAiApiKey(saved)
    expect(cleared.apiKey).toBeUndefined()
    expect(loadAiSettings().model).toBe('deepseek/test')
  })

  it('validates AI JSON into an app-owned MemoryPacket identity', () => {
    const target = createTarget('Aditi')
    const source = report(target.id)
    const packet = validateAiMemoryPacket({
      rawSummary: 'Aditi likes singing.',
      facts: [{ text: 'likes singing', category: 'preference', confidence: 'high' }],
      signals: [],
      emotions: [],
      risks: [],
      openLoops: [],
      patternHints: [],
      compressedUpdate: 'Aditi likes singing.',
      confidence: 'medium',
      needsHumanReview: true,
    }, source, target)
    expect(packet.reportId).toBe(source.id)
    expect(packet.targetId).toBe(target.id)
    expect(packet.identity.targetAlias).toBe('Aditi')
    expect(packet.facts[0].text).toBe('likes singing')
  })

  it('rejects malformed AI output before review/save', async () => {
    const target = createTarget('Aditi')
    const source = report(target.id)
    const fetcher = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), { status: 200 })
    await expect(extractMemoryWithOpenRouter(source, target, { ...loadAiSettings(), provider: 'openrouter', apiKey: 'test-placeholder' }, fetcher)).rejects.toThrow(/valid JSON/)
  })

  it('extracts a valid OpenRouter response into a reviewable packet', async () => {
    const target = createTarget('Aditi')
    const source = report(target.id)
    const content = JSON.stringify({
      rawSummary: 'Aditi likes singing.',
      facts: [{ text: 'likes singing', category: 'preference', confidence: 'high' }],
      signals: [{ text: 'She replied warmly.', direction: 'positive', confidence: 'medium' }],
      emotions: [],
      risks: [],
      openLoops: [],
      patternHints: [],
      compressedUpdate: 'Aditi likes singing and replied warmly.',
      confidence: 'medium',
      needsHumanReview: true,
    })
    const fetcher = async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
    const packet = await extractMemoryWithOpenRouter(source, target, { ...loadAiSettings(), provider: 'openrouter', apiKey: 'test-placeholder' }, fetcher)
    expect(packet.facts[0].text).toBe('likes singing')
    expect(packet.signals[0].direction).toBe('positive')
    expect(packet.needsHumanReview).toBe(true)
  })

  it('does not include locally stored API keys in workspace exports', async () => {
    saveAiSettings({ provider: 'openrouter', extractionMode: 'auto', apiKey: 'secret-placeholder-never-export', model: 'deepseek/test' })
    const target = await addTarget('Aditi')
    extractMemoryPacket(report(target.id), target)
    const workspace = await exportWorkspace()
    expect(JSON.stringify(workspace)).not.toContain('secret-placeholder-never-export')
  })
})
