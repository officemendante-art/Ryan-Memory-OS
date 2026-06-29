# Ryan Memory OS Workflow Guide

Ryan Memory OS is the memory layer.

Ryan Custom GPT is the advisor layer.

## Division of work

Ryan Memory OS:
- stores user profile
- stores target containers
- stores raw reports
- extracts reviewable memory
- saves selected facts/events/signals
- generates Ryan Case Packets

Ryan Custom GPT:
- reads Ryan Case Packets
- gives advice
- writes replies
- creates memory update packets
- helps interpret situations

## Normal workflow

1. User talks to target in real life / Instagram / WhatsApp.
2. User opens Ryan Memory OS.
3. User selects target.
4. User adds today's report.
5. App extracts memory.
6. User reviews and saves.
7. App updates target container.
8. User exports Ryan Case Packet.
9. User pastes packet into Ryan Custom GPT.
10. Ryan gives advice.

## Daily report workflow

User gives Ryan:

> Today's report for Aditi:
> I sent X.
> She replied Y.
> Then I said Z.
> She seemed warm/cold/confused.
> We ended here.
> Compress this for her profile.

Ryan returns:
- summary
- save-worthy memory
- what not to overread
- Memory Update Packet JSON
- current state
- open loops

## Case packet workflow

User pastes:

> Load this Ryan Case Packet.
> My question: what should I reply?

Ryan:
1. reads the user capsule
2. reads target capsule
3. checks story so far
4. checks latest event
5. checks risks/open loops
6. answers with the seven-part Ryan format

## If Ryan lacks context

Ryan asks only 1–3 important questions.

Examples:
- What exactly did she reply?
- Is this workplace/professional context?
- What was your last message?
- Did she ask anything back?
- What is your goal now: continue, repair, ask out, or exit?

## If the app's extraction is weak

Ryan should help create a better memory update.

User can say:
> Make this into a cleaner Memory Update Packet.

Ryan returns structured JSON.

## Memory hygiene rules

Target memory should store:
- facts
- preferences
- meaningful events
- positive/negative signals
- conflict history
- open loops
- response patterns
- current state
- strategy notes

Target memory should not store:
- every sentence
- emotional overreactions
- unsupported interpretations
- duplicate facts
- fantasy statements
- private details not needed for advice

## Compact profile principle

The more data grows, the more compression matters.

Good memory:
> Aditi likes singing and romance books. She responds better to light humor than direct compliments. There is an unresolved conflict where she felt the user does not listen properly.

Bad memory:
> Full 3,000-word chat transcript with no summary.

## How to judge success

Ryan Memory OS succeeds if:
- the user spends less than 60 seconds logging an interaction
- the target container becomes more accurate over time
- the case packet lets any good model understand the story quickly
- Ryan gives better advice because the context is clean
