# CareGraph

**Uncertainty-aware, country-adaptable referral orchestration for frontline health.**
World Bank *Small AI for Development — Health* (Hack-Nation). Hackathon prototype — **not for clinical use**.

> Minimize time to a safe, executable next action — not maximize confidence in a diagnosis.

## Run

```bash
npm install
cp .env.example .env          # optional: ElevenLabs, Twilio, Claude keys (never commit .env)
npm run dev                   # UI on http://localhost:8080 (in-browser demo works fully offline)
npm run telephony             # phone/WhatsApp/SMS server on :8787 (sandbox mode by default)
npm run check                 # typecheck + 28 tests
npm run benchmark             # regenerates docs/BENCHMARK.md
```

**Two modes in the header:**
- **In-browser demo:** both cases run entirely in the browser (no server needed).
- **Live: phone & WhatsApp:** the dashboard follows the case running on the telephony server.
  A phone simulator (call/IVR in Hindi, WhatsApp, SMS, hospital and doctor phones) drives the
  server with the *same webhooks and TwiML as Twilio*, at zero cost.

**Going live on real Twilio:** `TELEPHONY_MODE=live PUBLIC_URL=https://<tunnel> npm run telephony`,
expose port 8787 (`cloudflared tunnel --url http://localhost:8787`), then set the WhatsApp sandbox
"When a message comes in" to `<PUBLIC_URL>/twilio/whatsapp` and the number's voice webhook to
`<PUBLIC_URL>/twilio/voice`. Optional roles: `DEMO_HOSPITAL_WHATSAPP`, `DEMO_DOCTOR_WHATSAPP`.
A worker can WhatsApp `call` to get an IVR callback (works with a trial account's shared number).

**Pointing a hosted UI at a live server:** open the UI with `?live=1&tel=https://<PUBLIC_URL>`
(the server URL is remembered in that browser).

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

Screen: **left** = the health worker's conversation (speak, answer, authorize). **Right** = the CareGraph agent: live tool strip, then a six-stage pipeline — *Understand (evidence graph) → Triage (country protocol) → Uncertainty → Expert council → Where to go (top 3) → Transport & handoff*. Facts table, question ranking and audit trail live under **Details & audit**.

**Case A — Maternal emergency** (default tab)
1. *"Meet Asha, an ASHA worker. Her patient is 34 weeks pregnant with a severe headache. Asha doesn't learn a new system — she speaks."* → **▶ Play demo intake** (or mic).
2. Point at **Understand — evidence graph**: present findings ✓, unknown findings dashed **?** (never "no"). The hypertensive cluster leads and *cannot be excluded*. Yesterday's BP 151/98 is history, **not** today's BP.
3. **Triage** stage: BP is the chosen question; its value is raised by her gestational-hypertension history. *"It asks only the question that can change the decision."*
4. **Demo: 166/108** → red **Protocol rule** bubble: *"Urgent escalation criterion met (M-01). Further questioning will not delay referral."* Triage *Why?* shows WHO baseline + country-pack provenance.
5. **Expert council: not convened** — the rule is decisive, so no delay for deliberation. **Where to go — top 3**: District Hospital Barhi (recommended), Medical College (backup), private nursing home (*confirm by phone* — stale status). Forecast ≈52 min to definitive care. *"Why not closer?"* expands 7 nearer facilities that cannot provide it.
6. **Authorize & send** (human authorization gate) → WhatsApp-style minimal packet (unknowns stated explicitly) → Dr. Rao **ACCEPTS** → ambulance assigned → departed → arrived → **Handoff complete**.
7. *"Most clinical AI stops at a recommendation. CareGraph stays until the handoff is complete."*

**Case B — Ambiguous child** (tab B)
1. **▶ Play demo intake** → *"fractures happen easily"* is stored as **INFERRED** (needs confirmation), not fact.
2. Answer *Little force* → *Yes* (blue sclera) → **STOPPED: diminishing value**. Diagnosis **NOT ESTABLISHED**; protocol requires clinician confirmation.
3. **Evidence graph** keeps *Safeguarding concern* visible as *cannot be excluded* (not assessable by a community worker) — flagged to clinicians, never concluded.
4. **Expert council**: smallest council covering the rule's expertise — Dr. Iyer (pediatrics, lead), Dr. Khan (orthopaedics), Dr. Sen (genetics, async/non-blocking); GP, obstetrician, off-duty endocrinologist not included. Authorize → both reply **AGREE + REFER** → *CONSENSUS 2/2*. Opinions stored as **HUMAN PEER OPINION · CASE-SPECIFIC**.
5. CareGraph asks the lead's question (hearing) → top places: only the Medical College offers a genetics clinic → appointment booked, no ambulance (non-urgent).
5. *"When CareGraph doesn't know, it doesn't guess. It finds someone who does."*

Extras: header **no-response** toggle shows automatic escalation to the district referral desk; **Audit** opens the full trail; **हिन्दी / বাংলা** switches spoken questions.

## Architecture

```
src/engine/          framework-free TypeScript — runs on-device, no network needed
  logic.ts           Kleene 3-valued evaluation (TRUE / FALSE / UNKNOWN)
  extract.ts         deterministic lexicon extractor (+ Hindi glossary), negation-aware
  triage.ts          protocol execution + value-of-information question selection
  uncertainty.ts     7 uncertainty dimensions (no single fake confidence score)
  kg.ts              evidence graph: findings → problem clusters (risk × evidence × unresolved) → actions
  facilities.ts      capability/availability/acceptance/ETA matching
  experts.ts         expert council: smallest set covering required expertise in the response window
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

This repo follows Lovable's stack (Vite, React, TypeScript, Tailwind, `@/` alias, port 8080); `npm run build` is a plain `vite build`.

1. In Lovable: create a project → **GitHub → Connect** (Lovable creates a repo, or select this one if offered).
2. If Lovable created a new repo: `git remote add lovable <its URL> && git push lovable main --force`. Lovable syncs from then on.
3. Optional voice in the hosted UI: enable **Lovable Cloud** and add secret `ELEVENLABS_API_KEY`; the functions in `supabase/functions/` serve STT/TTS.
4. Live phone demo from the hosted UI: run `npm run telephony` + a tunnel, then open `<lovable-url>/?live=1&tel=<tunnel-url>`.
5. Tell Lovable not to modify `src/engine`, `src/protocols`, `src/data`, `src/models` (tested core); UI changes only.

Without any backend the hosted UI still runs the full in-browser demo (voice falls back to the pre-transcribed intake).

ElevenLabs is the **access layer**: Scribe transcribes the worker's Hindi voice note (original transcript kept); multilingual TTS speaks each question on the phone line.

## Safety boundaries

No autonomous diagnosis or prescribing · no invented evidence · no calibrated-probability claims (question priors are labelled heuristic) · no silent inference of missing facts · LLM/peer advice cannot override red-flag rules (conflicts are surfaced) · no real dispatch · synthetic data only · every rule carries source, jurisdiction, version and validation status.
