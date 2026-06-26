# Phase 1 QA Checklist

## Core flow

- [ ] Create a focused user profile and verify save/autosave feedback.
- [ ] Create target **Aditi** with alias only; verify optional fields may remain blank.
- [ ] Add a report: “likes singing”; verify raw report saves and is visible after refresh.
- [ ] Extract the report; edit/review it; save the reviewed packet.
- [ ] Confirm the target gains the expected fact, event, summary update, and timestamp.
- [ ] Add a conflict report; review/save it; confirm risk and open-loop state updates without deleting earlier evidence.
- [ ] Export a Ryan Case Packet as Markdown and JSON; verify selected context, target data, story, important memory, recent events, risks, open loops, and advisor-task template.
- [ ] Refresh the browser and verify profile, targets, reports, and memory persist.
- [ ] Export workspace JSON, import it into a clean local database, and verify data/reference integrity.

## Safety and validation

- [ ] Required target alias reports a clear validation error when blank.
- [ ] Invalid report fields show clear error feedback and make no partial write.
- [ ] Invalid/malformed import reports why it is invalid and makes no IndexedDB write.
- [ ] Imported content receives new local target IDs and correctly remapped references.
- [ ] Delete, reset, discard, and clear-demo actions require confirmation.
- [ ] Discarding a review packet writes no derived target memory.
- [ ] Form autosave does not overwrite another profile/target and exposes a save error if one occurs.
- [ ] A runtime exception shows safe recovery UI instead of a white screen.

## Demo and audit

- [ ] Empty workspace is the initial state.
- [ ] Load Demo Data requires confirmation and creates only `metadata.isDemo` fixtures.
- [ ] Clear Demo Data removes fixtures only and preserves real user data.
- [ ] System Audit flags incomplete records, reference issues, and storage-health warnings clearly.
- [ ] Metadata displays/records the last export time after a successful export.

## UI and release checks

- [ ] Every visible button performs its advertised action or is absent.
- [ ] No internal UUIDs are shown in normal UI.
- [ ] Layout remains usable on narrow/mobile widths.
- [ ] Keyboard focus and form labels are usable.
- [ ] Browser console has no uncaught errors during the core flow.
- [ ] Automated tests cover empty state, creation, merge/dedupe, conflict updates, packet generation, and export/import round-trip.
- [ ] `npm.cmd run build` succeeds.
