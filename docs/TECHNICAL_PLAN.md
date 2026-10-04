# CareGraph: an agentic AI for frontline escalation. Core design (v3)

*For the team. Supersedes v2. Three cores only: (1) asking the questions that matter, (2) a standard, attributable, country-adaptable score with honest uncertainty, (3) learning and calibration. Deadline: 4 Oct, 09:00 ET.*

## 0. Principles
- **Adopt, don't force.** Use widely deployed standards and services: WHO SMART/DAK content, WHO IMCI colour classes, FHIR R4, Twilio/WhatsApp, ElevenLabs, OpenAI or open-weight models. Obscure open-source tools may inspire the design but are not dependencies.
- **Bright Data: light use only.** At most an optional "check guideline source is current" action. Not core.
- **The agent decides actions, not diagnoses.** Questions are worth asking only if the answer can change *what we do*. That is the guard against both digging for root cause and escalating everything.
- **Claims come in two kinds:** *established* (validated literature, standards, proven-by-test properties) and *measured* (our replay and simulation harness, with scripts published).

---

## 1. Core 1: asking impactful questions

### 1.1 First-contact minimum dataset (asked once, up front)
Seven fields, derived from WHO danger-sign logic (ANC.DT.01, IMCI general danger signs) and the CRADLE vital-signs standard. Everything is optional; **"don't know" is always a valid answer and is stored as UNKNOWN, never as "no".**

| # | Field | Why it's first |
|---|---|---|
| 1 | **Who:** age, sex, pregnant? weeks? | Selects the pathway and the validated models that apply |
| 2 | **Main problem** (free voice/text) | Feeds extraction and knowledge coverage |
| 3 | **Since when** | Time-criticality |
| 4 | **Danger-sign screen:** one composite question (fits/unconscious · heavy bleeding · can't breathe · severe headache or vision change · can't drink/vomits everything · looks very ill) | WHO hard rules; one question covers the red flags |
| 5 | **Vitals if available:** BP, pulse, temperature | CRADLE traffic light; shock index |
| 6 | **Worker kit:** BP monitor? thermometer? dipstick? | Determines which questions are askable |
| 7 | **Location** (village or facility code) | Routing |

### 1.2 Channel formats (same data model on every channel)
- **IVR (primary).** One question per turn, spoken in the worker's language. Keypad: **1 = yes, 2 = no, 9 = don't know**. Numbers by keypad ("type the top BP number, then #"). Voice answers are accepted and confirmed by keypad when speech-to-text confidence is low.
- **WhatsApp.** Interactive buttons and lists. The first message is a fill-in template.
- **SMS fallback: fill-in-the-blank, tolerant parsing.**
  ```
  CG A:31 S:F P:34 C:headache,swelling D:? BP:166/108 HR:_ T:_
  ```
  `?` = don't know (UNKNOWN) · `_` = not measured · fields may come in any order or be missing.
  System reply (≤160 characters), one question at a time:
  ```
  CG Q1 Can you measure BP now? Reply BP:top/bottom or 9 if not possible
  ```
- **Every channel distinguishes "no" (2/N) from "don't know" (9/?).** This is the root of honest uncertainty.

### 1.3 Adaptive question policy (the agent's core loop)
**Action space:** escalation colour (IMCI-style RED / YELLOW / GREEN) × destination level, not diagnoses.

At each turn:
1. **Safety shield.** Any WHO hard rule fires → RED → **stop asking** → act.
2. **Compute the score *interval*** over all unknown facts (§2.2).
3. **Decided?** If the whole interval sits inside one colour band → **stop**; the action is determined. Remaining unknowns go on record as unknown.
4. **Otherwise,** for each askable question, compute the **expected value of information**: the probability that the answer moves the interval out of the ambiguous zone, × the cost of the wrong colour, ÷ the question's time cost.
5. **Stop and act conservatively** when the best question's value is below the **cost of delay** (set by urgency), or the per-urgency question budget is spent. The interval still straddles a threshold, so take the **higher colour** and say why.

**Balancing over-investigation and over-escalation explicitly:** the country pack sets the cost ratio (e.g. missing an emergency is 10× worse than an unnecessary referral). A high ratio means escalate sooner; a low ratio (scarce referral capacity) means ask one more question first. Questions never chase a diagnosis: if no answer can change the colour or destination, the question has zero value.

### 1.4 Question quality: what we measure
- **Decision-change rate:** share of asked questions whose answer changed the colour, destination or interval position.
- **Questions to decision,** and **time to decision.**
- **Redundancy:** questions whose answer was already implied.
- **Regret versus an oracle** (the decision made with full information, available in simulation).

---

## 2. Core 2: the score. Standard, attributable, interpretable, adaptable

### 2.1 Three tiers, strictly ordered
| Tier | What | Source | Overrides |
|---|---|---|---|
| **T0 Hard rules** | WHO danger signs (ANC.DT.01), IMCI general danger signs, CRADLE red (BP ≥160/110 or shock index ≥1.7) | WHO DAK; WHO IMCI; CRADLE trial | Everything below |
| **T1 Validated models**, *only where the population matches* | **miniPIERS** (hypertensive disorders of pregnancy, low/middle-income settings): risk of adverse maternal outcome within 48 h. Internal AUC 0.768, external 0.713. Positive at ≥25% (LR 5.09). **CRADLE shock index** bands (0.9 / 1.7) | Payne et al., PLoS Med 2014; CRADLE studies | T2 |
| **T2 Evidence-graph score** (no validated model applies) | Additive log-odds points over findings; each weight is attributed (WHO guideline, published likelihood ratio, or an *expert-pack weight* flagged as such); country priors | Knowledge graph + country pack | — |

A **model registry** stores each model's intended population. Example: miniPIERS applies only if pregnant ≥20 weeks with BP ≥140/90. Outside that population, the screen says **"no validated model applies"** instead of extrapolating.

### 2.2 Uncertainty as an interval (three-valued logic → risk range)
- UNKNOWN facts → evaluate the score at their **minimum and maximum** plausible values → **risk interval [low, high]**.
- *Worked example (miniPIERS, published equation):* systolic 166, 34 weeks, multiparous, headache, **dipstick unknown** → **≈6% to ≈11%** adverse-outcome risk within 48 h. The width is entirely due to proteinuria. The dipstick question's value is visible: does the range cross the 25% line?
- Two more uncertainty components, shown separately:
  - **Knowledge coverage:** findings the graph does not recognize.
  - **Model applicability:** whether a validated model covers this patient.
- Displayed as an **IMCI-style colour band with the range on it**, plus "what would narrow it" (the next question).

### 2.3 Attribution: "why this colour?"
- A waterfall of contributions, each with its source, version, jurisdiction and validation status. Example: "+1.34 × ln(systolic) · miniPIERS (PLoS Med 2014) · validated, external AUC 0.713".
- Exported as **FHIR `RiskAssessment`** (which supports `probabilityRange`), linked to the `ServiceRequest` for the referral.

### 2.4 Country adaptation without changing the score's structure
The **country pack** sets:
- colour thresholds;
- the cost ratio;
- which validated models are approved;
- local priors (prevalence);
- referral levels and transport (India 108/102; Kenya levels 1–6);
- languages and terminology.

The score's *structure* is identical across countries, so results are comparable. Only the parameters change, each with a versioned approval.

---

## 3. Core 3: learning, improvement, calibration

### 3.1 Where labels come from
The closed loop provides them:
- arrival and acceptance;
- the receiving facility's disposition or diagnosis (counter-referral);
- adverse outcome within 48 h (miniPIERS' own outcome definition);
- facility findings versus what the worker reported.

### 3.2 What learns, and how
| Learns automatically (bounded) | Method |
|---|---|
| Score calibration per country | Logistic recalibration (intercept + slope) first; isotonic once data allows |
| Question priors | Beta-binomial updating, shrunk toward the baseline |
| Worker answer reliability | Agreement with facility findings |
| Operational estimates (acceptance, response time, travel time) | Running Bayesian estimates |

**Never learns automatically:** T0 hard rules, thresholds, cost ratios. Those change only through an approved, versioned pack.

### 3.3 Monitoring
- Calibration-in-the-large, calibration slope, expected calibration error, Brier score.
- Under- and over-escalation rates.
- Decision-change rate.
- Drift alarms.

Lifecycle: **shadow mode → proposed update → clinician approval → new pack version → rollback possible.** This follows WHO's 2023 regulatory considerations on continuous learning.

### 3.4 What we can demonstrate now (simulation)
**Transportability.** A score calibrated in one country is mis-calibrated in another with different prevalence. Show the reliability curve before and after recalibration on N = 50, 100 and 200 simulated outcomes, and how many outcomes are needed before an update is proposed.

---

## 4. Performance claims

### 4.1 Established (literature, standards, proven by tests)
- **Validated components:**
  - miniPIERS: AUC 0.768 internal, 0.713 external; ≥25% threshold gives LR+ 5.09.
  - CRADLE thresholds: standard, trial-validated device.
  - WHO DAK danger signs: coverage checkable line by line against ANC.DT.01.
- **Safety properties, enforced by automated tests:**
  - no question is asked after a hard rule fires;
  - UNKNOWN never becomes "no";
  - INFERRED facts never fire rules;
  - every decision carries attribution;
  - invalid referral-state transitions are impossible.
- **Latency of the deterministic core** (measured, p50 / p95).

### 4.2 Measured by simulation (replay harness in the repo)
- **Case generator:** sampled from documented priors (ranges cited), with an **oracle** decision computed from full information.
- **Noise:** 0–60% missing answers; 0–10% wrong answers; speech-style corruption of the free-text narrative.
- **Compared against:**
  - (a) the full checklist (ask everything);
  - (b) danger-sign-only (ask nothing more);
  - (c) random question order;
  - (d) "missing = no" (two-valued logic).
- **Reported:**
  - questions to decision;
  - under-escalation and over-escalation versus the oracle;
  - regret;
  - **uncertainty calibration:** when CareGraph says "decided", how often it agrees with the oracle, and that "uncertain" cases are the ones that needed escalation or another question (a coverage-versus-risk curve);
  - latency per turn.
- Optional later: replay of real open data (PriMock57 audio for speech noise; PHMRC symptom profiles, which need a free registration). Roadmap only.

---

## 5. Agentic architecture
```
Channel adapters (IVR · WhatsApp · SMS)  ──►  Agent loop  ──►  Tools
   speech-to-text/voice (ElevenLabs)            │  1. what uncertainty blocks the action?
   template parser (SMS)                        │  2. choose tool / question (§1.3)
                                                │  3. deterministic guards (T0, state machine)
                                                ▼
 Tools: extract_case · run_hard_rules · score_interval · select_question
        find_destination · convene_council · request_transfer/transport
        schedule_followup · record_outcome · recalibrate (proposal only)
```
- **Where language models are used:** natural language in and out only (extraction with quoted evidence, translation, short summaries). Behind an adapter; local open-weight option. **Never in T0/T1/T2 decisions.**
- **Latency budget per IVR turn:**

  | Step | Budget |
  |---|---|
  | Speech-to-text | ≤ 600 ms |
  | Extraction | ≤ 700 ms |
  | Decision core | ≤ 10 ms |
  | Voice output start | ≤ 300 ms |

  Fallbacks: keypad input; lexicon extractor; SMS.

## 6. Post-triage intelligence and proactive actions
Kept from v2, built on the same agent loop:
- capability-aware destination with a backup;
- pre-arrival alert;
- automatic call-back when the patient hasn't arrived by ETA + margin;
- follow-up calls;
- counter-referral chasing.

## 7. Build order to the deadline
1. Fix the stall bug.
2. **Score engine:** T0 + miniPIERS (T1) + score interval + attribution (FHIR RiskAssessment shape).
3. **Question policy upgrade:** decision-interval stop rule + cost ratio + per-urgency question budget; first-contact minimum dataset.
4. **Simulation harness + benchmark report:** baselines, noise, uncertainty calibration, latency. Gives real numbers for the pitch.
5. **Channel views:** IVR call simulator (keypad 1/2/9) + SMS fill-in template parser + WhatsApp-style buttons.
6. **Calibration demo** (transportability, before/after).
7. UI: show colour band + range + "what would narrow it" + attribution waterfall; trim everything else.
8. Video and submission.

Sources:
- [miniPIERS, PLoS Med 2014](https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.1001589)
- [CRADLE VSA](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6173817/)
- [WHO SMART ANC, ANC.DT.01](https://build.fhir.org/ig/WorldHealthOrganization/smart-anc/)
- [WHO IMCI chart booklet](https://comdis-hsd.leeds.ac.uk/wp-content/uploads/sites/50/2016/01/IMCI-English-version.pdf)
- [WHO regulatory considerations on AI for health](https://who.int/news/item/19-10-2023-who-outlines-considerations-for-regulation-of-artificial-intelligence-for-health)
