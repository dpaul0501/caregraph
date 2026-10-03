# CareGraph

**Uncertainty-aware, country-adaptable referral orchestration for frontline health.**
World Bank *Small AI for Development — Health* (Hack-Nation). Hackathon prototype — **not for clinical use**.

> Minimize time to a safe, executable next action — not maximize confidence in a diagnosis.

## Run

```bash
npm install
npm run dev        # http://localhost:8080 (works fully offline in demo-fallback mode)
npm test           # engine tests: extraction, 3-valued logic, triage, VOI, state machine, both demo cases
npm run build
```

Optional: copy `.env.example` → `.env` and set `ELEVENLABS_API_KEY` for live speech-to-text / multilingual voice.
Without a key, the header shows **Voice: demo fallback** and the *Play demo intake* button injects the pre-transcribed script.

## What is real vs simulated

| Functional (real logic) | Simulated (synthetic data behind real interfaces) |
|---|---|
| Speech → text and spoken questions via ElevenLabs (with key) | Patient records (synthetic) |
| Fact extraction with explicit `OBSERVED / REPORTED / INFERRED / UNKNOWN` | Facility registry, live status feed, travel times (fictional district) |
| Three-valued rule engine — UNKNOWN never becomes *false*; INFERRED never fires a rule | Specialist directory and peer replies |
| Value-of-information question selection (history changes priors) | Receiving-facility acceptance |
| Emergency stop rule — no more questions once a red-flag rule fires | 108 ambulance dispatch / tracking |
| Facility matching: capability + staff on duty + acceptance + freshness + ETA | Country pack content (structure realistic, **not MoH-approved**) |
| Expert routing: smallest appropriate available node within urgency window | Counter-referral message |
| Referral + transport state machines, escalation on timeout, authorization gates | |
| Audit trail of every tool call, rule, transition, authorization, human response | |

## Demo script (≈100 s)

**Case A — Maternal emergency** (default tab)
1. *"Meet Asha, an ASHA worker. Her patient is 34 weeks pregnant with a severe headache. Asha doesn't learn a new system — she speaks."* → **▶ Play demo intake** (or mic).
2. Point at **Structured case**: facts extracted; *visual disturbance, convulsions, BP = UNKNOWN* (hatched). Yesterday's BP 151/98 is history, **not** today's BP.
3. **Next question** panel: BP ranks top; value raised by her gestational-hypertension history. *"It asks only the question that can change the decision."*
4. **Demo: 166/108** → red **Protocol rule** bubble: *"Urgent escalation criterion met (M-01). Further questioning will not delay referral."* Triage *Why?* shows WHO baseline + country-pack provenance.
5. **Facility match**: District Hospital Barhi selected (21 km); *"8 facilities are nearer — none can provide emergency obstetric care right now"* (nearest PHC lacks C-section/blood; CHC's obstetrician is on leave; private nursing home's status is stale).
6. **Authorize & send** (human authorization gate) → WhatsApp-style minimal packet (unknowns stated explicitly) → Dr. Rao **ACCEPTS** → ambulance assigned → departed → arrived → **Handoff complete**.
7. *"Most clinical AI stops at a recommendation. CareGraph stays until the handoff is complete."*

**Case B — Ambiguous child** (tab B)
1. **▶ Play demo intake** → *"fractures happen easily"* is stored as **INFERRED** (needs confirmation), not fact.
2. Answer *Little force* → *Yes* (blue sclera) → **STOPPED: diminishing value**. Diagnosis **NOT ESTABLISHED**; protocol requires clinician confirmation.
3. **Expertise network**: GP / obstetrician / orthopaedist (in surgery) / geneticist (Friday only) ruled out with reasons → **Dr. Iyer, pediatrician** selected.
4. Peer replies *"Ask about hearing problems; specialist referral appropriate."* → stored as **HUMAN PEER OPINION · CASE-SPECIFIC**, not global knowledge → CareGraph asks the peer's question → referral booked at the genetics clinic.
5. *"When CareGraph doesn't know, it doesn't guess. It finds someone who does."*

Extras: header **no-response** toggle shows automatic escalation to the district referral desk; **Audit** opens the full trail; **हिन्दी / বাংলা** switches spoken questions.

## Architecture

```
src/engine/          framework-free TypeScript — runs on-device, no network needed
  logic.ts           Kleene 3-valued evaluation (TRUE / FALSE / UNKNOWN)
  extract.ts         deterministic lexicon extractor (+ Hindi glossary), negation-aware
  triage.ts          protocol execution + value-of-information question selection
  uncertainty.ts     7 uncertainty dimensions (no single fake confidence score)
  facilities.ts      capability/availability/acceptance/ETA matching
  experts.ts         expertise routing within urgency response window
  referral.ts        referral + transport state machines (invalid transitions throw)
  summary.ts         minimal clinician decision packet
  orchestrator.ts    agent loop: "what uncertainty blocks the next safe action?" → tool
src/protocols/       versioned protocol JSON (rules carry WHO baseline + local source)
src/data/            country pack, facilities, experts, synthetic patients, scenarios
src/ui/              React + Tailwind judge-facing UI
server/api.ts        local /api/voice-* (Vite middleware)
supabase/functions/  voice-health / voice-stt / voice-tts Edge Functions (Lovable Cloud)
```

Safety-critical logic (red flags, thresholds, eligibility, transitions, escalation) is deterministic.
A language model may be added for extraction/explanations behind the same `extract_case` interface; it can never override a fired rule.

## Lovable + ElevenLabs

This repo follows Lovable's stack (Vite, React, TypeScript, Tailwind, `@/` alias, port 8080).

1. In Lovable: create a project → **Connect GitHub** (Lovable creates the repo).
2. Clone that repo, copy this project's files in, push. Lovable syncs both ways from then on — keep iterating on UI in Lovable; keep `src/engine`, `src/protocols`, `src/data` as the logic core.
3. Enable **Lovable Cloud** (Supabase). Add secret `ELEVENLABS_API_KEY` (optional: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_STT_MODEL`, `ELEVENLABS_TTS_MODEL`). The functions in `supabase/functions/` serve STT/TTS; the client switches to them automatically when `VITE_SUPABASE_URL` is set.
4. Prompting Lovable: tell it *not* to change files under `src/engine/`, `src/protocols/`, `src/data/` and to read state only via `useAgent()`.

ElevenLabs is used for **access**, not decoration: Scribe transcribes the worker's speech (original transcript preserved beside the structured case); multilingual TTS speaks each clarifying question in Hindi/Bengali/English. Fallbacks: pre-transcribed intake; browser speech synthesis.

## Safety boundaries

No autonomous diagnosis or prescribing · no invented evidence · no calibrated-probability claims (question priors are labelled heuristic) · no silent inference of missing facts · LLM/peer advice cannot override red-flag rules (conflicts are surfaced) · no real dispatch · synthetic data only · every rule carries source, jurisdiction, version and validation status.
