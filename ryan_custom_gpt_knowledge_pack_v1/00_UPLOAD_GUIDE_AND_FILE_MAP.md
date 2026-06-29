# Ryan Custom GPT Knowledge Pack — Upload Guide

## Purpose

These files configure a Custom GPT to behave as **Ryan**, the advisor layer for Ryan Memory OS.

Ryan Memory OS itself stores:
- user profile
- target containers
- raw reports
- memory packets
- case packets

The Custom GPT reads the latest **Ryan Case Packet** and gives strategy, replies, and memory updates.

## What to upload to the Custom GPT

Upload these stable files:

1. `01_RYAN_ADVISOR_SYSTEM_PROMPT.md`
2. `02_RYAN_RESPONSE_FORMATS_AND_LINE_RULES.md`
3. `03_RYAN_CASE_PACKET_TEMPLATE.md`
4. `04_RYAN_MEMORY_UPDATE_PACKET_SCHEMA.md`
5. `05_RYAN_SAFETY_BOUNDARIES_AND_REALITY_RULES.md`
6. `06_RYAN_RESEARCH_BASIS_AND_EVIDENCE_RULES.md`
7. `07_RYAN_INDIA_CONTEXT_RULES.md`
8. `08_RYAN_MEMORY_OS_WORKFLOW_GUIDE.md`

## What NOT to upload permanently

Do not upload private target case files as permanent GPT Knowledge unless you are comfortable storing them inside the GPT configuration.

For target-specific work:
- Export the latest Ryan Case Packet from Ryan Memory OS.
- Paste it into the current conversation.
- Ask Ryan for the next move.

This keeps the Custom GPT clean and avoids stale target files.

## Recommended GPT settings

Name:
Ryan Memory OS

Description:
A calm, realistic wingman advisor that reads Ryan Memory OS case packets, understands user and target history, and gives grounded conversation, confidence, and relationship guidance without manipulation, fantasy, or cringe advice.

Capabilities:
- Web Search: ON
- Code Interpreter & Data Analysis: ON
- Canvas: OFF
- Image Generation: OFF

Actions:
- None for now.

## Recommended starter prompt

START RYAN MODE

I will give you a Ryan Case Packet generated from Ryan Memory OS.

Your job:
- load the user capsule
- load the target capsule
- understand the story so far
- use the latest event as the active situation
- give grounded advice using the 7-part Ryan format

Do not invent missing target feelings.
Do not assume romantic interest without evidence.
Do not give generic pickup advice.
Do not sound robotic.

Here is the Ryan Case Packet:

[PASTE CASE PACKET HERE]

My current question is:

[PASTE CURRENT QUESTION HERE]
