# CareGraph: Lovable app design

*For the team and for Lovable's AI editor. Fill the placeholders in `src/config/site.ts`; the screens are already built in this repo, and Lovable is for polishing them.*

## 1. Design goals
1. **A judge understands it in 30 seconds:** one person (an ASHA), one problem (getting a patient to care that can treat her), three verbs (**ASK → ROUTE → CLOSE**).
2. **Real, not a mock-up:** the Console runs the actual agent, and in Live mode an actual phone, WhatsApp and SMS.
3. **Evidence on screen, not in slides:** benchmark numbers, validated model, standards, limitations.
4. **Respectful of others:** we complement existing services; we never claim to replace them.

## 2. Information architecture (hash routes, so static hosting works anywhere)

| Route | Screen | Purpose |
|---|---|---|
| `#/` | **Home** | Story, three verbs, proof numbers, how to try it (phone / WhatsApp / browser), video |
| `#/console` | **Console** | The live product: worker conversation, agent pipeline; *In-browser demo* or *Live: phone & WhatsApp* |
| `#/evidence` | **Evidence** | Benchmark tables, model card, safety properties, WHO/UNESCO mapping, limitations, how it works |

Top navigation: `CareGraph · Home · Console · Evidence · GitHub`. Footer on every page: *Hackathon prototype — not for clinical use.*

## 3. Visual system
- **Colours.** Brand teal `#0f766e`. Urgency colours follow WHO IMCI semantics: **red/pink = urgent referral** `#dc2626`, **yellow = treat and follow up** `#d97706`, **green = home care** `#059669`. UNKNOWN is shown as a **grey hatched pattern**, never blank and never green.
- **Type.** System sans (offline-safe); numbers in tabular mono.
- **Shape.** 14px radius cards, 1px `#e2e8f0` borders, no heavy shadows. Phone frame: 34px radius, slate-900 bezel.
- **Tone.** Calm and clinical. One accent per screen. Real copy; no lorem ipsum.

## 4. Screens

### 4.1 Home (`#/`)
```
┌────────────────────────────────────────────────────────────────────────┐
│ NAV  CareGraph   Home  Console  Evidence  GitHub                       │
├───────────────────────────────────────────┬────────────────────────────┤
│ HERO                                      │  PHONE MOCK (static)       │
│ "An ASHA calls from any phone.            │  🔊 नमस्ते, यह केयरग्राफ है… │
│  CareGraph asks only what matters and     │  🎙 "31 साल की महिला…"       │
│  gets her patient to care that can        │  🔊 ब्लड प्रेशर नाप सकती हैं?  │
│  treat her."                              │  ⌨ 166 / 108               │
│ [Try it in the browser] [Call/WhatsApp]   │  🔊 यह आपातकाल है…           │
├───────────────────────────────────────────┴────────────────────────────┤
│ PROBLEM  ~50,000 maternal deaths/yr from hypertensive disorders (WHO)  │
│          ~1 in 4 community referrals not completed (median 74%)        │
│          1,000,000+ ASHAs — voice, not apps                            │
├────────────────────────────────────────────────────────────────────────┤
│  ASK                    ROUTE                     CLOSE                │
│  Only questions that    Right care, not nearest:  Stays until handoff: │
│  can change the action; capability + staff +      acceptance, transport│
│  unknown stays unknown  acceptance + travel time  arrival, follow-up   │
├────────────────────────────────────────────────────────────────────────┤
│ PROOF  3.5 vs 6 questions · ½ the missed emergencies under noise ·     │
│        0.04 ms per decision · validated miniPIERS risk ranges          │
├────────────────────────────────────────────────────────────────────────┤
│ TRY IT  📞 {{PHONE_NUMBER}}  💬 WhatsApp {{WHATSAPP_NUMBER}} "{{JOIN}}"│
│         🖥 Console (in-browser, works offline)                         │
├────────────────────────────────────────────────────────────────────────┤
│ VIDEO {{DEMO_VIDEO_URL}}                                               │
│ BUILT ON  WHO SMART ANC · IMCI · CRADLE · miniPIERS · FHIR R4 ·        │
│           WHO AI ethics · UNESCO AI ethics                             │
│ PARTNERS  ElevenLabs · Lovable · Twilio · Claude                       │
│ TEAM {{TEAM}}                                                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Console (`#/console`): already built
- **In-browser demo:** worker conversation (left) + agent pipeline (right): Understand → Triage (with the risk card) → Uncertainty → Expert escalation → Where to go (top 3) → Transport & handoff.
- **Live:** phone simulator (ASHA / Hospital / Doctor phones; Call · WhatsApp · SMS) | conversation | pipeline. Follows the case on the telephony server (`?tel=` or `TELEPHONY_URL` placeholder).

### 4.3 Evidence (`#/evidence`)
1. Headline numbers (from `public/benchmark.json`).
2. Benchmark table per noise level: CareGraph vs ablations vs checklist vs danger-signs-only.
3. Model card: miniPIERS, published coefficients, AUC 0.768 / 0.713, intended population, threshold 25%.
4. Safety properties enforced by tests.
5. Standards and ethics mapping (WHO six principles, WHO regulatory considerations, UNESCO).
6. How it works: agent loop and learning loop.
7. **Limitations:** simulation assumptions; demo country pack not ministry-approved; synthetic patients.

## 5. Placeholders (single source: `src/config/site.ts`)
| Key | Meaning | Example |
|---|---|---|
| `phoneNumber` | Number judges can call (or "WhatsApp CALL for a callback") | `{{PHONE_NUMBER}}` |
| `whatsappNumber` | Twilio WhatsApp sandbox number | `+1 415 523 8886` |
| `whatsappJoinCode` | Sandbox join phrase | `{{WHATSAPP_JOIN_CODE}}` |
| `demoVideoUrl` | YouTube/Loom embed URL | `{{DEMO_VIDEO_URL}}` |
| `telephonyUrl` | Live server (tunnel or host) | `{{TELEPHONY_URL}}` |
| `team` | Names and roles | `{{TEAM}}` |
| `githubUrl` | Repo | `https://github.com/dpaul0501/caregraph` |

Empty values render as **dashed, labelled placeholder boxes**, never broken links.

## 6. Prompts to paste into Lovable (one at a time)
> **Rule for every prompt:** *"Only edit files in `src/pages`, `src/ui`, `src/config`, and `index.css`. Do not modify `src/engine`, `src/protocols`, `src/data`, `src/models`, `server`, `supabase`, `scripts`, or `tests`."*

1. *"Polish the Home page hero: keep the copy, make the phone mock feel like a real Android call screen, add a subtle entrance animation for the transcript lines (respect reduced-motion). Keep the teal/IMCI colour tokens."*
2. *"On Home, turn the three ASK / ROUTE / CLOSE cards into an illustrated horizontal flow with simple line icons (phone + question mark, map pin + hospital, check + handshake). Mobile: stack vertically."*
3. *"On Evidence, render the benchmark table from `public/benchmark.json` as a grouped bar chart (missed emergencies by policy, one group per noise level). CareGraph in brand teal, others neutral greys. Keep the tables below the chart."*
4. *"Make the whole site responsive down to 360px; the Console can stack panels vertically on mobile."*
5. *"Add an Open Graph image and favicon using the CareGraph node logo."*
