import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  db,
  addTarget,
  clearDemoData,
  deleteTarget,
  duplicateTarget,
  exportTargetBundle,
  exportWorkspace,
  importTargetBundle,
  ImportValidationError,
  savePacket,
  saveReport,
  saveTarget,
  saveUserProfile,
  setMetadata,
} from './lib/db/storage'
import { loadDemoData } from './lib/demoData'
import { extractMemoryPacket } from './lib/memory/extractor'
import { mergeMemoryPacket } from './lib/memory/merge'
import { casePacketToMarkdown, generateRyanCasePacket } from './lib/memory/packetGenerator'
import {
  SCHEMA_VERSION,
  newId,
  nowIso,
  type Confidence,
  type MemoryPacket,
  type RawReport,
  type ReportType,
  type RyanCasePacket,
  type TargetContainer,
  type UserProfile,
} from './lib/schema'

type Page = 'dashboard' | 'profile' | 'targets' | 'report' | 'review' | 'export' | 'audit'
type ReviewState = { report: RawReport; packet: MemoryPacket; selected: Record<string, boolean> }
type LooseProfile = Partial<UserProfile> & Record<string, string | undefined>
type LooseTarget = TargetContainer & Record<string, unknown>

const nav: Array<[Page, string, string]> = [
  ['dashboard', '◇', 'Dashboard'],
  ['profile', '◎', 'User Profile'],
  ['targets', '◉', 'Targets'],
  ['report', '✎', 'Add Report'],
  ['review', '✓', 'Memory Review'],
  ['export', '⇧', 'Export Packet'],
  ['audit', '⌁', 'System Audit'],
]

const reportTypes: ReportType[] = [
  'conversation_update',
  'new_fact',
  'conflict',
  'positive_signal',
  'negative_signal',
  'meetup',
  'social_media',
  'call',
  'other',
]

const reportExamples = [
  'Today I found out she likes singing.',
  "Yesterday we argued; she said I don't listen properly.",
  'She replied warmly and asked me what I do.',
]

const today = () => new Date().toISOString().slice(0, 10)
const itemKey = (kind: string, index: number) => `${kind}-${index}`
const labelType = (type: string) => type.replaceAll('_', ' ')
const targetSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'target'

const download = (filename: string, content: string, type: string) => {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

const filledCount = (values: Array<string | undefined>) => values.filter((value) => value?.trim()).length

function AppBody() {
  const [page, setPage] = useState<Page>('dashboard')
  const [targets, setTargets] = useState<TargetContainer[]>([])
  const [profile, setProfile] = useState<UserProfile | undefined>()
  const [reports, setReports] = useState<RawReport[]>([])
  const [packets, setPackets] = useState<MemoryPacket[]>([])
  const [lastExport, setLastExport] = useState<string | undefined>()
  const [activeTargetId, setActiveTargetId] = useState('')
  const [notice, setNotice] = useState<{ kind: string; text: string } | null>(null)
  const [profileDraft, setProfileDraft] = useState<LooseProfile>({})
  const [targetDraft, setTargetDraft] = useState<LooseTarget | undefined>()
  const [newAlias, setNewAlias] = useState('')
  const [reportDraft, setReportDraft] = useState({
    targetId: '',
    type: 'conversation_update' as ReportType,
    occurredAt: today(),
    content: '',
    title: '',
  })
  const [review, setReview] = useState<ReviewState | null>(null)
  const [packetPreview, setPacketPreview] = useState('')
  const [packetJson, setPacketJson] = useState('')
  const [includeProfile, setIncludeProfile] = useState(true)
  const [eventCount, setEventCount] = useState('5')
  const [detailedMode, setDetailedMode] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const activeTarget = targets.find((target) => target.id === activeTargetId)

  const refresh = async () => {
    const [nextTargets, nextProfile, nextReports, nextPackets, exportMetadata] = await Promise.all([
      db.targets.orderBy('lastUpdated').reverse().toArray(),
      db.userProfiles.get('primary'),
      db.reports.orderBy('occurredAt').reverse().toArray(),
      db.packets.orderBy('lastUpdated').reverse().toArray(),
      db.metadata.get('last-export'),
    ])
    setTargets(nextTargets)
    setProfile(nextProfile)
    setReports(nextReports)
    setPackets(nextPackets)
    setLastExport(exportMetadata?.value)
    setActiveTargetId((prior) => (prior && nextTargets.some((target) => target.id === prior) ? prior : nextTargets[0]?.id ?? ''))
  }

  const tell = (text: string, kind = 'success') => {
    setNotice({ text, kind })
    window.setTimeout(() => setNotice(null), 4600)
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => tell(error instanceof Error ? error.message : 'Unable to open local storage.', 'error'))
  }, [])

  useEffect(() => {
    setProfileDraft(
      profile ? { ...(profile as LooseProfile) } : {
        name: '',
        preferredName: '',
        location: '',
        relationshipGoals: '',
        personalContext: '',
        advisorContext: '',
        notes: '',
      },
    )
  }, [profile])

  useEffect(() => {
    setTargetDraft(activeTarget ? (structuredClone(activeTarget) as LooseTarget) : undefined)
    setReportDraft((draft) => ({ ...draft, targetId: activeTarget?.id ?? draft.targetId }))
  }, [activeTargetId, targets])

  useEffect(() => {
    if (!profileDraft.name?.trim()) return
    const timer = window.setTimeout(() => {
      void saveUserProfile(profileDraft as Omit<UserProfile, 'id' | 'createdAt' | 'lastUpdated'>).catch(() =>
        tell('Profile autosave could not complete. Use Save profile to retry.', 'error'),
      )
    }, 900)
    return () => window.clearTimeout(timer)
  }, [profileDraft])

  useEffect(() => {
    if (!targetDraft?.id || !targetDraft.alias.trim()) return
    const timer = window.setTimeout(() => {
      void saveTarget(targetDraft).catch(() => tell('Target autosave could not complete. Use Save target to retry.', 'error'))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [targetDraft])

  const profileCompletion = useMemo(() => {
    const fields = [
      profileDraft.name,
      profileDraft.location,
      profileDraft.relationshipGoals,
      profileDraft.communicationStyle ?? profileDraft.socialStyle,
      profileDraft.personalContext,
      profileDraft.advisorContext,
      profileDraft.notes,
      profileDraft.interests,
    ]
    return Math.min(100, Math.round((filledCount(fields) / fields.length) * 100))
  }, [profileDraft])

  const targetReadiness = useMemo(() => {
    if (!targetDraft) return 0
    const optionalFields = [
      targetDraft.alias,
      targetDraft.location as string | undefined,
      targetDraft.relationshipContext as string | undefined,
      targetDraft.notes as string | undefined,
      targetDraft.personalityClues as string | undefined,
      targetDraft.importantHistory as string | undefined,
      targetDraft.doNotForget as string | undefined,
      targetDraft.unclearAssumptions as string | undefined,
    ]
    const memoryWeight = Math.min(3, targetDraft.facts.length + targetDraft.events.length)
    return Math.min(100, Math.round(((filledCount(optionalFields) + memoryWeight) / 11) * 100))
  }, [targetDraft])

  const stats = useMemo(
    () => ({
      events: targets.reduce((total, target) => total + target.events.length, 0),
      loops: targets.reduce((total, target) => total + target.openLoops.filter((loop) => loop.status === 'open').length, 0),
      latest: targets[0]?.alias ?? '—',
      completion: profile ? profileCompletion : 0,
    }),
    [profile, profileCompletion, targets],
  )

  const saveProfile = async () => {
    try {
      if (!profileDraft.name?.trim()) throw new Error('Enter your name or nickname before saving your profile.')
      await saveUserProfile(profileDraft as Omit<UserProfile, 'id' | 'createdAt' | 'lastUpdated'>)
      await refresh()
      tell('User profile saved locally.')
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Profile could not be saved.', 'error')
    }
  }

  const resetProfile = async () => {
    if (!window.confirm('Reset the user profile? This removes only your profile, not targets or reports.')) return
    await db.userProfiles.delete('primary')
    await refresh()
    tell('User profile reset.')
  }

  const createTarget = async () => {
    try {
      const created = await addTarget(newAlias)
      setNewAlias('')
      setActiveTargetId(created.id)
      await refresh()
      setPage('targets')
      tell(`${created.alias} target created.`)
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Target could not be created.', 'error')
    }
  }

  const saveCurrentTarget = async () => {
    try {
      if (!targetDraft) return
      if (!targetDraft.alias.trim()) throw new Error('Target alias is required before saving.')
      const saved = await saveTarget(targetDraft)
      setActiveTargetId(saved.id)
      await refresh()
      tell(`${saved.alias} saved locally.`)
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Target could not be saved.', 'error')
    }
  }

  const removeTarget = async () => {
    if (!activeTarget || !window.confirm(`Delete ${activeTarget.alias} and its linked reports, reviewed memory, and packets? This cannot be undone.`)) return
    await deleteTarget(activeTarget.id)
    await refresh()
    tell('Target and its linked local records were deleted.')
  }

  const duplicateCurrent = async () => {
    if (!activeTarget) return
    const copy = await duplicateTarget(activeTarget.id)
    setActiveTargetId(copy.id)
    await refresh()
    tell(`${copy.alias} created as a clean duplicate.`)
  }

  const exportCurrent = async () => {
    if (!activeTarget) return
    download(`${targetSlug(activeTarget.alias)}-target.json`, JSON.stringify(await exportTargetBundle(activeTarget.id), null, 2), 'application/json')
    tell('Target JSON exported.')
  }

  const exportAll = async () => {
    download('ryan-memory-os-workspace.json', JSON.stringify(await exportWorkspace(), null, 2), 'application/json')
    tell('All local targets exported.')
  }

  const importTarget = async (file?: File) => {
    if (!file) return
    try {
      const target = await importTargetBundle(await file.text())
      setActiveTargetId(target.id)
      await refresh()
      tell(`${target.alias} imported as a separate local target.`)
    } catch (error) {
      tell(
        error instanceof ImportValidationError
          ? error.issues.join(' ')
          : error instanceof Error
            ? error.message
            : 'The selected file could not be imported.',
        'error',
      )
    }
  }

  const saveRawOnly = async () => {
    try {
      if (!reportDraft.targetId || !reportDraft.content.trim()) throw new Error('Choose a target and enter a report before saving.')
      const stamp = nowIso()
      await saveReport({
        id: newId(),
        targetId: reportDraft.targetId,
        type: reportDraft.type,
        occurredAt: reportDraft.occurredAt,
        title: reportDraft.title,
        content: reportDraft.content,
        createdAt: stamp,
        lastUpdated: stamp,
        metadata: { source: 'local' },
      })
      setReportDraft((draft) => ({ ...draft, content: '', title: '' }))
      await refresh()
      tell('Raw report saved without extraction.')
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Report could not be saved.', 'error')
    }
  }

  const extract = () => {
    try {
      if (!activeTarget || reportDraft.targetId !== activeTarget.id || !reportDraft.content.trim()) {
        throw new Error('Select a target and enter report text before extracting memory.')
      }
      const stamp = nowIso()
      const report: RawReport = {
        id: newId(),
        targetId: activeTarget.id,
        type: reportDraft.type,
        occurredAt: reportDraft.occurredAt,
        title: reportDraft.title,
        content: reportDraft.content,
        createdAt: stamp,
        lastUpdated: stamp,
        metadata: { source: 'local' },
      }
      const packet = extractMemoryPacket(report, activeTarget)
      const selected: Record<string, boolean> = {}
      for (const [kind, items] of Object.entries({
        facts: packet.facts,
        signals: packet.signals,
        emotions: packet.emotions,
        risks: packet.risks,
        openLoops: packet.openLoops,
        patternHints: packet.patternHints,
      })) {
        items.forEach((_, index) => {
          selected[itemKey(kind, index)] = true
        })
      }
      setReview({ report, packet, selected })
      setPage('review')
      tell('Memory was extracted locally. Review every item before saving.', 'info')
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Unable to extract memory.', 'error')
    }
  }

  const updateReviewText = (kind: keyof MemoryPacket, index: number, value: string) => {
    if (!review) return
    const packet = structuredClone(review.packet)
    const list = packet[kind] as Array<{ text?: string }> | string[]
    const item = list[index]
    if (typeof item === 'string') (list as string[])[index] = value
    else item.text = value
    setReview({ ...review, packet })
  }

  const updateReviewConfidence = (kind: 'facts' | 'signals' | 'emotions' | 'risks', index: number, confidence: Confidence) => {
    if (!review) return
    const packet = structuredClone(review.packet)
    ;(packet[kind][index] as { confidence: Confidence }).confidence = confidence
    setReview({ ...review, packet })
  }

  const saveReviewed = async () => {
    try {
      if (!review || !activeTarget) return
      const packet = structuredClone(review.packet)
      packet.facts = packet.facts.filter((_, i) => review.selected[itemKey('facts', i)])
      packet.signals = packet.signals.filter((_, i) => review.selected[itemKey('signals', i)])
      packet.emotions = packet.emotions.filter((_, i) => review.selected[itemKey('emotions', i)])
      packet.risks = packet.risks.filter((_, i) => review.selected[itemKey('risks', i)])
      packet.openLoops = packet.openLoops.filter((_, i) => review.selected[itemKey('openLoops', i)])
      packet.patternHints = packet.patternHints.filter((_, i) => review.selected[itemKey('patternHints', i)])
      const merged = mergeMemoryPacket(activeTarget, review.report, packet)
      await db.transaction('rw', db.targets, db.reports, db.packets, async () => {
        await saveReport(review.report)
        await saveTarget(merged)
        await savePacket(packet)
      })
      setReview(null)
      setReportDraft((draft) => ({ ...draft, content: '', title: '' }))
      await refresh()
      setPage('targets')
      tell('Selected memory was merged into the target container.')
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Reviewed memory could not be saved.', 'error')
    }
  }

  const buildVisibleCasePacket = (): RyanCasePacket | undefined => {
    if (!activeTarget) return undefined
    const packet = generateRyanCasePacket(activeTarget, includeProfile ? profile : undefined)
    if (eventCount !== 'all') packet.story = packet.story.slice(-Number(eventCount))
    if (!detailedMode) {
      packet.importantMemory.facts = packet.importantMemory.facts.slice(-8)
      packet.importantMemory.signals = packet.importantMemory.signals.slice(-6)
      packet.importantMemory.emotionState = packet.importantMemory.emotionState.slice(-5)
      packet.risks = packet.risks.slice(-5)
      packet.openLoops = packet.openLoops.slice(-5)
    }
    return packet
  }

  const generatePacket = async () => {
    const packet = buildVisibleCasePacket()
    if (!packet) return tell('Create or select a target before generating a case packet.', 'error')
    const markdown = casePacketToMarkdown(packet)
    const json = JSON.stringify(packet, null, 2)
    const timestamp = nowIso()
    setPacketPreview(markdown)
    setPacketJson(json)
    await setMetadata('last-export', timestamp)
    setLastExport(timestamp)
    tell('Ryan Case Packet generated locally.')
  }

  const copyPacket = async () => {
    try {
      await navigator.clipboard.writeText(packetPreview)
      tell('Case packet copied.')
    } catch {
      tell('Clipboard access was blocked. Use the preview to copy the packet.', 'warning')
    }
  }

  const loadDemo = async () => {
    if (!window.confirm('This adds clearly tagged sample data to your local workspace. Continue?')) return
    const seed = await loadDemoData()
    setActiveTargetId(seed.target.id)
    await refresh()
    tell('Optional Aditi demo data loaded. It stays separate from real records.')
  }

  const clearDemo = async () => {
    if (!window.confirm('Clear only demo-tagged records? Your real targets, reports, and profile will remain.')) return
    await clearDemoData()
    await refresh()
    tell('Demo data cleared; real local data was preserved.')
  }

  const exportProfile = () => {
    if (!profile) return tell('Save a user profile before exporting it.', 'error')
    download(
      'ryan-user-profile.json',
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, exportType: 'user-profile', exportedAt: nowIso(), profile }, null, 2),
      'application/json',
    )
    tell('User profile exported.')
  }

  const header = (title: string, intro: string, actions?: React.ReactNode) => (
    <header className="page-header hero-card">
      <div>
        <div className="eyebrow">Ryan Memory OS · local-first</div>
        <h1>{title}</h1>
        <p className="page-intro">{intro}</p>
      </div>
      {actions}
    </header>
  )

  const profileInput = (label: string, key: string, opts: { area?: boolean; hint?: string; optional?: boolean; placeholder?: string } = {}) => (
    <div className={`field ${opts.area ? 'span-full' : ''}`}>
      <label>
        {label} {opts.optional && <span>optional</span>}
      </label>
      {opts.area ? (
        <textarea
          value={profileDraft[key] ?? ''}
          placeholder={opts.placeholder}
          onChange={(event) => setProfileDraft((draft) => ({ ...draft, [key]: event.target.value }))}
        />
      ) : (
        <input
          value={profileDraft[key] ?? ''}
          placeholder={opts.placeholder}
          onChange={(event) => setProfileDraft((draft) => ({ ...draft, [key]: event.target.value }))}
        />
      )}
      {opts.hint && <div className="field-help">{opts.hint}</div>}
    </div>
  )

  const targetInput = (label: string, key: string, opts: { area?: boolean; hint?: string; optional?: boolean; placeholder?: string } = {}) => (
    <div className={`field ${opts.area ? 'span-full' : ''}`}>
      <label>
        {label} {opts.optional && <span>optional</span>}
      </label>
      {opts.area ? (
        <textarea
          value={(targetDraft?.[key] as string | undefined) ?? ''}
          placeholder={opts.placeholder}
          onChange={(event) => setTargetDraft((draft) => (draft ? { ...draft, [key]: event.target.value } : draft))}
        />
      ) : (
        <input
          value={(targetDraft?.[key] as string | undefined) ?? ''}
          placeholder={opts.placeholder}
          onChange={(event) => setTargetDraft((draft) => (draft ? { ...draft, [key]: event.target.value } : draft))}
        />
      )}
      {opts.hint && <div className="field-help">{opts.hint}</div>}
    </div>
  )

  const renderDashboard = () => (
    <>
      {header(
        'Your memory, kept straight.',
        'Capture small moments, review what matters, and export a factual case packet whenever you need outside perspective.',
        <div className="section-actions">
          <button className="button primary" onClick={() => setPage('report')}>Add today&apos;s report</button>
          <button className="button" onClick={loadDemo}>Load demo data</button>
        </div>,
      )}
      <section className="grid stats">
        <Stat label="Targets" value={targets.length} note="Separate private containers" />
        <Stat label="Events" value={stats.events} note="Chronological and auditable" />
        <Stat label="Open loops" value={stats.loops} note="Needs a future check" />
        <Stat label="Latest target" value={stats.latest} note="Most recently updated" />
        <Stat label="Profile ready" value={`${stats.completion}%`} note={profile ? 'User context is saved' : 'Start with your profile'} />
      </section>
      <section className="card card-pad hero-panel">
        <div className="section-head">
          <div>
            <h2>Memory workflow</h2>
            <p className="card-copy">Ryan Memory OS manages the story. You stay in control of what becomes saved memory.</p>
          </div>
        </div>
        <div className="workflow">
          {[
            ['1', 'User profile', 'Stable Ryan context'],
            ['2', 'Target', 'One container per person'],
            ['3', 'Report', 'Fast daily capture'],
            ['4', 'Extract', 'Local, deterministic'],
            ['5', 'Review', 'Edit before saving'],
            ['6', 'Merge', 'Build the timeline'],
            ['7', 'Export', 'Clean case packet'],
          ].map(([number, title, copy]) => (
            <div key={title} className="workflow-step">
              <div className="workflow-num">STEP {number}</div>
              <strong>{title}</strong>
              <small>{copy}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="grid two-col section-gap">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h2>Recent target activity</h2>
              <p className="card-copy">A compact view of locally saved reports and reviewed events.</p>
            </div>
            <button className="button small" onClick={() => setPage('targets')}>Open targets</button>
          </div>
          {reports.length ? (
            reports.slice(0, 5).map((report) => (
              <div className="event" key={report.id}>
                <div className="event-top">
                  <strong>{targets.find((target) => target.id === report.targetId)?.alias ?? 'Unknown target'} · {labelType(report.type)}</strong>
                  <span className="muted">{report.occurredAt}</span>
                </div>
                <p>{report.content}</p>
              </div>
            ))
          ) : (
            <div className="empty">No reports yet. Add a target, then capture the next interaction or fact.</div>
          )}
        </div>
        <div className="card card-pad">
          <h2>Private by default</h2>
          <p className="card-copy">Everything in Phase 1 stays in this browser&apos;s IndexedDB storage. There is no account, server, or hidden AI request.</p>
          <div className="notice info">Export is explicit. Nothing is shared until you copy or download it.</div>
          <div className="section-actions section-gap-small">
            <button className="button" onClick={exportAll}>Export all targets</button>
            <button className="button danger" onClick={clearDemo}>Clear demo data</button>
          </div>
        </div>
      </section>
    </>
  )

  const renderProfile = () => (
    <>
      {header(
        'User Profile',
        'A focused foundation for the context you may choose to include in a Ryan Case Packet.',
        <div className="section-actions">
          <button className="button" onClick={exportProfile}>Export JSON</button>
          <button className="button danger" onClick={resetProfile}>Reset profile</button>
          <button className="button success" onClick={saveProfile}>Save profile</button>
        </div>,
      )}
      <section className="grid two-col">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h2>Foundation</h2>
              <p className="card-copy">Required: name or nickname. Everything else is optional and local.</p>
            </div>
            <span className="chip success">{profileCompletion}% ready</span>
          </div>
          <div className="grid field-grid">
            {profileInput('Name / nickname', 'name', { placeholder: 'Ryan' })}
            {profileInput('Age or birth year', 'ageOrBirthYear', { optional: true, placeholder: 'e.g. 1998 or late 20s' })}
            {profileInput('City', 'city', { optional: true })}
            {profileInput('State / country', 'location', { optional: true })}
            {profileInput('Languages', 'languages', { optional: true, placeholder: 'English, Hindi, Marathi...' })}
            {profileInput('Relationship goal', 'relationshipGoals', { optional: true, placeholder: 'e.g. build slowly, serious relationship' })}
          </div>
        </div>
        <aside className="card card-pad readiness-card">
          <h2>Profile readiness</h2>
          <p className="card-copy">Inspired by the study wireframe, but kept deliberately smaller for Phase 1.</p>
          <div className="ring" style={{ '--progress': `${profileCompletion * 3.6}deg` } as React.CSSProperties}>
            <span>{profileCompletion}%</span>
          </div>
          <div className="progress"><span style={{ width: `${profileCompletion}%` }} /></div>
          <p className="card-copy">This profile is never sent anywhere by the app. You decide whether to include it on the packet screen.</p>
        </aside>
      </section>
      <section className="card card-pad section-gap">
        <div className="section-head">
          <div>
            <h2>Context Ryan should remember</h2>
            <p className="card-copy">Free-text areas for the nuance that dropdowns cannot capture.</p>
          </div>
          <span className="chip">Autosaves after name is set</span>
        </div>
        <div className="grid field-grid">
          {profileInput('Personality summary', 'personalitySummary', { area: true, optional: true })}
          {profileInput('Social and communication style', 'communicationStyle', { area: true, optional: true })}
          {profileInput('More about me / deeper context', 'personalContext', {
            area: true,
            optional: true,
            hint: 'Strengths, weaknesses, insecurities, values, and background that matter.',
          })}
          {profileInput('Important notes Ryan should remember', 'advisorContext', {
            area: true,
            optional: true,
            hint: 'Only include details you may want in exported case packets.',
          })}
        </div>
      </section>
    </>
  )

  const renderTargets = () => {
    const openItems = targetDraft ? [...targetDraft.risks.filter((risk) => risk.status === 'open'), ...targetDraft.openLoops.filter((loop) => loop.status === 'open')] : []
    return (
      <>
        {header(
          'Targets',
          'One target = one living memory container. Keep each story separate, editable, and exportable.',
          <div className="section-actions">
            <button className="button" onClick={exportAll}>Export all JSON</button>
            <button className="button" onClick={() => importRef.current?.click()}>Import target JSON</button>
          </div>,
        )}
        <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => { void importTarget(event.target.files?.[0]); event.currentTarget.value = '' }} />
        <section className="grid two-col">
          <aside className="card card-pad">
            <h2>Create a target</h2>
            <p className="card-copy">Alias/label is the only required field. Internal IDs stay hidden.</p>
            <div className="field">
              <label>Target label / alias</label>
              <input value={newAlias} onChange={(event) => setNewAlias(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void createTarget()} placeholder="e.g. Aditi" />
            </div>
            <button className="button success section-gap-small" onClick={createTarget}>Create target</button>
            <div className="section-head section-gap">
              <div>
                <h3>Your containers</h3>
                <p className="card-copy">Select one to edit its factual memory.</p>
              </div>
            </div>
            <div className="target-list">
              {targets.length ? targets.map((target) => (
                <button key={target.id} className={`target-row ${target.id === activeTargetId ? 'active' : ''}`} onClick={() => setActiveTargetId(target.id)}>
                  <span>
                    <strong>{target.alias}</strong>
                    <small>{target.summary}</small>
                  </span>
                  <span className="chip">{target.events.length} events</span>
                </button>
              )) : <div className="empty">No targets yet.</div>}
            </div>
          </aside>
          <div className="card card-pad">
            {targetDraft ? (
              <>
                <div className="section-head">
                  <div>
                    <h2>{targetDraft.alias}</h2>
                    <p className="card-copy">A living local memory container. Save only what you want preserved.</p>
                  </div>
                  <div className="section-actions">
                    <span className="chip success">{targetReadiness}% ready</span>
                    <button className="button small" onClick={duplicateCurrent}>Duplicate</button>
                    <button className="button small" onClick={exportCurrent}>Export</button>
                    <button className="button small danger" onClick={removeTarget}>Delete</button>
                  </div>
                </div>
                <div className="grid field-grid">
                  {targetInput('Alias', 'alias')}
                  {targetInput('Real name', 'fullName', { optional: true })}
                  {targetInput('Age range guess', 'ageRange', { optional: true })}
                  {targetInput('City / context', 'location', { optional: true })}
                  {targetInput('How you know her', 'relationshipContext', { optional: true })}
                  {targetInput('Familiarity / current status', 'status', { optional: true })}
                  {targetInput('What I know about her so far', 'notes', { area: true, optional: true })}
                  {targetInput('Personality/vibe clues', 'personalityClues', { area: true, optional: true })}
                  {targetInput('Important history', 'importantHistory', { area: true, optional: true })}
                  {targetInput('Things Ryan should not forget', 'doNotForget', { area: true, optional: true })}
                  {targetInput('Unclear assumptions / needs verification', 'unclearAssumptions', { area: true, optional: true })}
                </div>
                <div className="section-actions section-gap-small">
                  <button className="button success" onClick={saveCurrentTarget}>Save target</button>
                  <button className="button primary" onClick={() => { setReportDraft((draft) => ({ ...draft, targetId: targetDraft.id })); setPage('report') }}>Add today&apos;s report</button>
                </div>
                <div className="section-gap">
                  <h3>Reviewed memory</h3>
                  <div className="chip-list section-gap-small">
                    {targetDraft.facts.length ? targetDraft.facts.slice(-10).map((fact) => <span className="chip success" key={fact.id}>{fact.text}</span>) : <span className="muted">No reviewed facts yet.</span>}
                  </div>
                  <h3 className="section-gap-small">Current risks and open loops</h3>
                  <div className="chip-list section-gap-small">
                    {openItems.length ? openItems.map((item) => <span className="chip warn" key={item.id}>{item.text}</span>) : <span className="muted">None recorded.</span>}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty">Create a target or select an existing container.</div>
            )}
          </div>
        </section>
      </>
    )
  }

  const renderReport = () => (
    <>
      {header('Add Today&apos;s Report', 'Fast capture first. Select target, paste the note, extract memory, then review before anything is saved.')}
      <section className="grid two-col fast-report">
        <div className="card card-pad">
          <div className="grid field-grid">
            <div className="field">
              <label>Target</label>
              <select value={reportDraft.targetId} onChange={(event) => { setReportDraft((draft) => ({ ...draft, targetId: event.target.value })); setActiveTargetId(event.target.value) }}>
                <option value="">Select a target</option>
                {targets.map((target) => <option key={target.id} value={target.id}>{target.alias}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Report type</label>
              <select value={reportDraft.type} onChange={(event) => setReportDraft((draft) => ({ ...draft, type: event.target.value as ReportType }))}>
                {reportTypes.map((type) => <option key={type} value={type}>{labelType(type)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={reportDraft.occurredAt} onChange={(event) => setReportDraft((draft) => ({ ...draft, occurredAt: event.target.value }))} />
            </div>
            <div className="field">
              <label>Optional exact-message title <span>optional</span></label>
              <input value={reportDraft.title} onChange={(event) => setReportDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="e.g. Her exact text" />
            </div>
            <div className="field span-full">
              <label>Raw report text</label>
              <textarea
                className="report-textarea"
                value={reportDraft.content}
                onChange={(event) => setReportDraft((draft) => ({ ...draft, content: event.target.value }))}
                placeholder="Today I found out Aditi likes singing also."
              />
              <div className="field-help">Capture facts, interaction summaries, or exact message context. The review step stays in control.</div>
            </div>
          </div>
          <div className="section-actions section-gap-small">
            <button className="button" onClick={() => setReportDraft((draft) => ({ ...draft, content: '', title: '' }))}>Clear</button>
            <button className="button" onClick={() => void saveRawOnly()}>Save raw only</button>
            <button className="button primary" onClick={extract}>Extract memory</button>
          </div>
        </div>
        <aside className="card card-pad">
          <h2>Helper examples</h2>
          <p className="card-copy">Click any example to paste it into the report box.</p>
          <div className="example-list">
            {reportExamples.map((example) => (
              <button key={example} className="example-button" onClick={() => setReportDraft((draft) => ({ ...draft, content: example }))}>
                “{example}”
              </button>
            ))}
          </div>
          <div className="notice warning section-gap-small">Extraction never becomes target memory until you review and save selected items.</div>
        </aside>
      </section>
    </>
  )

  const reviewList = (title: string, kind: 'facts' | 'signals' | 'emotions' | 'risks' | 'openLoops' | 'patternHints', editableConfidence = false) => {
    if (!review) return null
    const values = review.packet[kind] as Array<{ text?: string; confidence?: Confidence }> | string[]
    return (
      <section className="card card-pad review-card">
        <div className="section-head">
          <div>
            <h3>{title}</h3>
            <p className="card-copy">Save toggle controls whether this item enters the target container.</p>
          </div>
          <span className="chip">{values.length}</span>
        </div>
        {values.length ? values.map((item, index) => {
          const key = itemKey(kind, index)
          const text = typeof item === 'string' ? item : item.text ?? ''
          return (
            <div className="review-item" key={key}>
              <label className="save-toggle">
                <input
                  aria-label={`Save ${title} item`}
                  type="checkbox"
                  checked={review.selected[key] ?? false}
                  onChange={(event) => setReview({ ...review, selected: { ...review.selected, [key]: event.target.checked } })}
                />
                <span>{review.selected[key] ?? false ? 'Save' : "Don't save"}</span>
              </label>
              <div>
                <div className="review-kind">{kind}</div>
                <textarea value={text} onChange={(event) => updateReviewText(kind, index, event.target.value)} />
              </div>
              {editableConfidence ? (
                <select
                  aria-label="Confidence"
                  value={typeof item === 'string' ? 'medium' : item.confidence ?? 'medium'}
                  onChange={(event) => updateReviewConfidence(kind as 'facts' | 'signals' | 'emotions' | 'risks', index, event.target.value as Confidence)}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              ) : (
                <span className="chip">review</span>
              )}
            </div>
          )
        }) : <div className="empty">Nothing detected in this category.</div>}
      </section>
    )
  }

  const renderReview = () => (
    <>
      {header(
        'Memory Review',
        'Edit, keep, or discard extracted items before anything changes the selected target container.',
        <div className="section-actions">
          <button className="button danger" onClick={() => { setReview(null); setPage('report'); tell('Extracted packet discarded. Nothing was saved.') }}>Discard</button>
          <button className="button success" onClick={() => void saveReviewed()} disabled={!review}>Save selected to target</button>
        </div>,
      )}
      {review ? (
        <>
          <div className="notice info section-gap-small">
            Reviewing report for <strong>{activeTarget?.alias}</strong>. Confidence is not truth; it is a reminder to check the evidence.
          </div>
          {reviewList('Facts to add', 'facts', true)}
          {reviewList('Signals', 'signals', true)}
          {reviewList('Emotions', 'emotions', true)}
          {reviewList('Risks', 'risks', true)}
          {reviewList('Open loops', 'openLoops')}
          {reviewList('Pattern hints', 'patternHints')}
          <section className="card card-pad section-gap-small">
            <h3>Compressed update</h3>
            <p className="card-copy">{review.packet.compressedUpdate}</p>
          </section>
        </>
      ) : (
        <div className="empty">No extracted packet is waiting. Add a report, choose Extract Memory, and return here to review it.</div>
      )}
    </>
  )

  const renderExport = () => (
    <>
      {header('Export Ryan Case Packet', 'Create a compact, factual case file to copy into GPT, Claude, Grok, or another advisor. Ryan Memory OS stores context; it does not provide advice.')}
      <section className="grid two-col">
        <div className="card card-pad">
          <div className="grid field-grid">
            <div className="field">
              <label>Target</label>
              <select value={activeTargetId} onChange={(event) => setActiveTargetId(event.target.value)}>
                <option value="">Select a target</option>
                {targets.map((target) => <option key={target.id} value={target.id}>{target.alias}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Recent events</label>
              <select value={eventCount} onChange={(event) => setEventCount(event.target.value)}>
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div className="mode-row">
            <label className="chip"><input type="checkbox" checked={includeProfile} onChange={(event) => setIncludeProfile(event.target.checked)} /> Include user capsule</label>
            <label className={`chip ${detailedMode ? 'success' : ''}`}><input type="checkbox" checked={detailedMode} onChange={(event) => setDetailedMode(event.target.checked)} /> {detailedMode ? 'Detailed mode' : 'Compact mode'}</label>
          </div>
          <div className="section-actions section-gap-small">
            <button className="button primary" onClick={() => void generatePacket()}>Generate case packet</button>
            <button className="button" disabled={!packetPreview} onClick={() => void copyPacket()}>Copy packet</button>
            <button className="button" disabled={!packetPreview} onClick={() => download(`${targetSlug(activeTarget?.alias ?? 'ryan')}-case-packet.md`, packetPreview, 'text/markdown')}>Download MD</button>
            <button className="button" disabled={!packetJson} onClick={() => download(`${targetSlug(activeTarget?.alias ?? 'ryan')}-case-packet.json`, packetJson, 'application/json')}>Download JSON</button>
          </div>
        </div>
        <aside className="card card-pad case-file-side">
          <h2>Packet contents</h2>
          <div className="chip-list section-gap-small">
            <span className="chip">User capsule</span>
            <span className="chip">Target capsule</span>
            <span className="chip">Story so far</span>
            <span className="chip">Important memory</span>
            <span className="chip warn">Risks and open loops</span>
            <span className="chip">Advisor task template</span>
          </div>
          <p className="card-copy">Preview is intentionally formatted like a serious case file so it can be pasted straight into an external model.</p>
        </aside>
      </section>
      {packetPreview && (
        <section className="card card-pad case-file section-gap">
          <div className="section-head">
            <div>
              <h2>Ryan Case Packet preview</h2>
              <p className="card-copy">{detailedMode ? 'Detailed mode includes more memory.' : 'Compact mode keeps the packet tight.'}</p>
            </div>
            <span className="chip success">schemaVersion {SCHEMA_VERSION}</span>
          </div>
          <pre className="pre">{packetPreview}</pre>
        </section>
      )}
    </>
  )

  const renderAudit = () => {
    const warnings = [
      !profile && 'User profile is missing.',
      ...targets.filter((target) => !target.summary || target.summary === 'No reviewed memory yet.').map((target) => `${target.alias} has no reviewed summary.`),
      ...targets.filter((target) => target.risks.some((risk) => risk.status === 'open')).map((target) => `${target.alias} has an unresolved risk.`),
      ...reports.filter((report) => !targets.some((target) => target.id === report.targetId)).map(() => 'A report without a target was found.'),
    ].filter(Boolean) as string[]
    return (
      <>
        {header(
          'System Audit',
          'Check the health and completeness of this browser&apos;s local Ryan Memory OS workspace.',
          <div className="section-actions">
            <button className="button" onClick={() => { void refresh(); tell('Storage validation completed. Review any warnings below.', warnings.length ? 'warning' : 'success') }}>Run storage validation</button>
            <button className="button" onClick={loadDemo}>Load demo data</button>
            <button className="button danger" onClick={clearDemo}>Clear demo data</button>
          </div>,
        )}
        <section className="grid stats">
          <Stat label="App version" value="0.1.0" note="Phase 1 local MVP" />
          <Stat label="Storage" value="Ready" note="Dexie / IndexedDB" />
          <Stat label="Targets" value={targets.length} note="Current local count" />
          <Stat label="Packets" value={packets.length} note="Saved reviewed packets" />
          <Stat label="Last export" value={lastExport ? new Date(lastExport).toLocaleDateString() : 'Never'} note={lastExport ? new Date(lastExport).toLocaleTimeString() : 'No packet generated'} />
        </section>
        <section className="grid two-col section-gap">
          <div className="card card-pad">
            <h2>Validation warnings</h2>
            {warnings.length ? <div className="warning-list">{warnings.map((warning) => <div className="notice warning" key={warning}>{warning}</div>)}</div> : <div className="notice success section-gap-small">No basic local-data warnings found.</div>}
          </div>
          <div className="card card-pad">
            <h2>Local data policy</h2>
            <p className="card-copy">Imports are validated before IndexedDB writes. Exports include schema versioning. Demo cleanup only removes demo-tagged data.</p>
            <button className="button" onClick={exportAll}>Download workspace export</button>
          </div>
        </section>
      </>
    )
  }

  const renderPage = () => ({
    dashboard: renderDashboard,
    profile: renderProfile,
    targets: renderTargets,
    report: renderReport,
    review: renderReview,
    export: renderExport,
    audit: renderAudit,
  }[page]())

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>Ryan Memory OS</strong>
            <small>Private local workspace</small>
          </div>
        </div>
        <nav className="nav-group" aria-label="Main navigation">
          <div className="nav-label">Workspace</div>
          {nav.map(([key, icon, name]) => (
            <button key={key} className={`nav-button ${page === key ? 'active' : ''}`} onClick={() => setPage(key)}>
              <span className="nav-icon">{icon}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>Local-only Phase 1</strong><br />
          No account. No cloud. No hidden advisor engine.
        </div>
      </aside>
      <main className="page">{renderPage()}</main>
      {notice && <div className={`toast notice ${notice.kind}`}>{notice.text}</div>}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <article className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </article>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppBody />
    </ErrorBoundary>
  )
}
