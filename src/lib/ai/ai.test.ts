import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addTarget, db, exportWorkspace } from '../db/storage'
import { extractMemoryPacket } from '../memory/extractor'
import { createTarget, newId, nowIso, type RawReport } from '../schema'
import { extractWithAiRouter, routeProviders } from './aiRouter'
import { clearAllAiKeys, createProviderConfig, loadAiSettings, saveAiSettings } from './aiSettings'
import { validateAiMemoryPacket } from './providers/openAICompatibleProvider'

const report = (targetId: string, content = 'Aditi likes singing.'): RawReport => {
  const stamp = nowIso()
  return { id: newId(), targetId, content, type: 'conversation_update', occurredAt: '2026-06-27', createdAt: stamp, lastUpdated: stamp }
}

const validAiBody = () => JSON.stringify({
  choices: [{
    message: {
      content: JSON.stringify({
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
      }),
    },
  }],
})

beforeEach(async () => {
  localStorage.clear()
  db.close()
  await db.delete()
  await db.open()
})

describe('Ryan Memory OS AI extraction safety', () => {
  it('saves and clears provider configs locally without leaking keys into public settings', () => {
    const saved = saveAiSettings({
      defaultExtractionMode: 'auto',
      providers: [createProviderConfig('gemini', { label: 'Gemini Free Key 1', apiKey: 'local-test-placeholder', model: 'gemini-2.5-flash', priority: 1 })],
    })
    expect(loadAiSettings().providers[0].apiKey).toBe('local-test-placeholder')
    const cleared = clearAllAiKeys(saved)
    expect(cleared.providers[0].apiKey).toBeUndefined()
    expect(cleared.providers[0].model).toBe('gemini-2.5-flash')
    expect(JSON.stringify(cleared)).not.toContain('local-test-placeholder')
  })

  it('orders enabled remote providers by priority before local fallback', () => {
    const settings = saveAiSettings({
      providers: [
        createProviderConfig('openrouter', { label: 'OpenRouter second', apiKey: 'b', priority: 2 }),
        createProviderConfig('gemini', { label: 'Gemini first', apiKey: 'a', priority: 1 }),
      ],
    })
    expect(routeProviders(settings).map((provider) => provider.label)).toEqual(['Gemini first', 'OpenRouter second'])
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
    const settings = saveAiSettings({
      defaultExtractionMode: 'ai',
      providers: [createProviderConfig('openrouter', { apiKey: 'test-placeholder', priority: 1 })],
    })
    const fetcher = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), { status: 200 })
    await expect(extractWithAiRouter(source, target, settings, fetcher)).rejects.toThrow(/valid JSON/)
  })

  it('extracts a valid OpenRouter-compatible response into a reviewable packet', async () => {
    const target = createTarget('Aditi')
    const source = report(target.id)
    const settings = saveAiSettings({
      defaultExtractionMode: 'ai',
      providers: [createProviderConfig('openrouter', { label: 'OpenRouter DeepSeek', apiKey: 'test-placeholder', priority: 1 })],
    })
    const fetcher = async () => new Response(validAiBody(), { status: 200 })
    const result = await extractWithAiRouter(source, target, settings, fetcher)
    expect(result.sourceLabel).toContain('OpenRouter DeepSeek')
    expect(result.packet.facts[0].text).toBe('likes singing')
    expect(result.packet.signals[0].direction).toBe('positive')
    expect(result.packet.needsHumanReview).toBe(true)
  })

  it('Auto mode falls back to local extraction when remote providers fail', async () => {
    const target = createTarget('Aditi')
    const source = report(target.id)
    const settings = saveAiSettings({
      defaultExtractionMode: 'auto',
      providers: [createProviderConfig('gemini', { label: 'Gemini Free Key', apiKey: 'test-placeholder', priority: 1 })],
    })
    const fetcher = async () => new Response('rate limited', { status: 429 })
    const result = await extractWithAiRouter(source, target, settings, fetcher)
    expect(result.usedLocalFallback).toBe(true)
    expect(result.packet.facts[0].text).toContain('likes singing')
    expect(result.attempts[0].status).toBe('rate_limited')
  })

  it('AI-only mode errors safely when all providers fail', async () => {
    const target = createTarget('Aditi')
    const source = report(target.id)
    const settings = saveAiSettings({
      defaultExtractionMode: 'ai',
      providers: [createProviderConfig('openrouter', { label: 'Bad provider', apiKey: 'test-placeholder', priority: 1 })],
    })
    const fetcher = async () => new Response('server unavailable', { status: 503 })
    await expect(extractWithAiRouter(source, target, settings, fetcher)).rejects.toThrow(/AI extraction failed/)
  })

  it('does not include locally stored API keys in workspace exports', async () => {
    saveAiSettings({
      defaultExtractionMode: 'auto',
      providers: [createProviderConfig('openrouter', { apiKey: 'secret-placeholder-never-export', model: 'deepseek/test', priority: 1 })],
    })
    const target = await addTarget('Aditi')
    extractMemoryPacket(report(target.id), target)
    const workspace = await exportWorkspace()
    expect(JSON.stringify(workspace)).not.toContain('secret-placeholder-never-export')
  })

  it('local heuristic works without any provider key', async () => {
    const target = createTarget('Aditi')
    const source = report(target.id)
    const result = await extractWithAiRouter(source, target, loadAiSettings())
    expect(result.sourceLabel).toBe('local heuristic')
    expect(result.packet.facts[0].text).toContain('likes singing')
  })
})
