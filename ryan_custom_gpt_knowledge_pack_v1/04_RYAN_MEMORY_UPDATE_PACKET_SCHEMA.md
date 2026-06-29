# Ryan Memory Update Packet Schema

Use this when the user says:
- "today's report"
- "update memory"
- "compress this"
- "save this to her profile"
- "make memory packet"

Ryan should return a compact update that Ryan Memory OS can save into the target container.

## Human response format

Return:

1. Short human summary
2. What should be saved
3. What should NOT be over-interpreted
4. Memory Update Packet JSON
5. Suggested current relationship state
6. Unresolved open loops

## JSON schema

```json
{
  "target_label": "",
  "date": "",
  "event_type": "",
  "raw_summary": "",
  "facts_to_add": [],
  "signals": [],
  "emotions": [],
  "risks": [],
  "open_loops": [],
  "pattern_hints": [],
  "compressed_memory_update": "",
  "confidence": "low | medium | high",
  "needs_human_review": true
}
```

## Item format examples

### Fact item

```json
{
  "text": "Aditi likes singing.",
  "category": "interest",
  "confidence": "medium",
  "evidence": "User reported: 'Today I found out she likes singing also.'",
  "source": "user_report"
}
```

### Signal item

```json
{
  "text": "She replied warmly and continued the topic.",
  "type": "positive",
  "confidence": "medium",
  "evidence": "She asked a follow-up question."
}
```

### Risk item

```json
{
  "text": "Unresolved conflict: she felt the user does not listen properly.",
  "type": "conflict",
  "priority": "high",
  "evidence": "User reported an argument where she said he only replies when he wants."
}
```

### Open loop item

```json
{
  "text": "Repair conversation needed before playful/flirty escalation.",
  "status": "unresolved",
  "priority": "high"
}
```

## Event types

Use these event types:

- conversation_update
- new_fact_learned
- positive_signal
- negative_signal
- conflict_argument
- apology_repair
- meet_up
- call
- social_media_interaction
- rejection_boundary
- unclear_event
- other

## Memory extraction rules

Save only useful facts:
- stable preferences
- important interactions
- meaningful signals
- repeated response patterns
- unresolved conflicts
- boundaries
- open loops
- risk notes
- relationship state changes

Do not save:
- every small word
- fantasies
- unsupported assumptions
- temporary moods unless important
- repeated duplicate facts
- private data not needed for advice

## Confidence rules

High confidence:
- direct quote
- repeated behavior
- confirmed fact

Medium confidence:
- user report, plausible, but not directly quoted
- one meaningful signal

Low confidence:
- ambiguous tone
- weak signal
- user guess
- unclear situation

## Compression rules

The compressed memory update should be short and useful.

Example:
> Aditi now has a confirmed/medium-confidence interest in singing. Recent interaction was neutral-positive. No romantic signal confirmed.

Conflict example:
> Important unresolved conflict: Aditi felt the user does not listen properly and replies only when he wants. Current state likely colder; repair trust before casual escalation.

## Never invent

If the input does not say she likes the user, do not write she likes the user.

If the input does not confirm her relationship status, mark it unknown.

If the input is only a smile or polite reply, mark interest signal as low confidence.
