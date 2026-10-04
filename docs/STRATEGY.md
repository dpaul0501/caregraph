# CareGraph: what we built, what we demo, what we can claim, how we win

*World Bank Small AI for Development (Health), run by Hack-Nation. Working document for the team, 3 October 2026.*

---

## 0. The short version

1. **Hard deadline: project submission is 4 October, 9:00 AM ET.** Winners are notified 5–6 October. One person per winning team presents a talk at the Global AI & Digital Summit in Seoul on 21 October.
2. **One winner per sector.** We compete only against the other health teams.
3. **The organisers provide a health dataset and challenge materials for the weekend.** We have not used them yet. This is the biggest open risk: get them from the Hack-Nation platform now and show we used them.
4. **The World Bank's own words:** small AI means *"focused, fit-for-purpose AI solutions designed to solve specific problems, particularly in environments with limited connectivity, limited infrastructure, or constrained resources,"* and the call asks: *"Can you build something that works with limited connectivity, local data, and familiar tools like SMS and voice?"* Our demo is a web dashboard, so we must visibly show **voice + SMS + offline**.
5. **Our winning story** is one sentence: *CareGraph turns a health worker's voice note into a safe, executable referral, then stays with the patient until handoff, and it runs on a phone without the internet.* Frame the impact with the **three delays model** of maternal death (delay in deciding to seek care, reaching care, receiving care). CareGraph attacks all three.
6. **What makes us different** is not a better diagnosis model. It is the layer between "this patient may need escalation" and "the patient reached appropriate care". That layer is coordination: protocol, knowledge graph, operations and human experts. WHO's own referral requirements describe this layer, and most systems stop before it.
7. **Before the deadline, in order:** fix the reported stall bug → integrate the organisers' dataset → make it look like voice/SMS on a phone, not a dashboard → add an impact card → record a 2-minute video → submit. Everything else is optional.

---

## 1. The competition: facts

| Item | Fact | Source |
|---|---|---|
| Organisers | World Bank Group; run by Hack-Nation | [WB FAQ](https://thedocs.worldbank.org/en/doc/a2d80d7a647019e16e7265a3563ce416-0320012026/original/Small-AI-for-Development-Hackathon-FAQs.pdf) |
| Definition of small AI | "focused, fit-for-purpose AI solutions designed to solve specific problems, particularly in environments with limited connectivity, limited infrastructure, or constrained resources" | WB FAQ §2 |
| Core challenge question | "Can you build something that works with limited connectivity, local data, and familiar tools like SMS and voice?" | [ADB/WB challenge page](https://challenges.adb.org/en/challenges/small-ai-for-development-hackathon) |
| Sectors | Agriculture, health, tourism; **one winner per sector** | WB FAQ §12, §15 |
| Data | "Participants will receive challenge materials and sector-specific datasets" | WB FAQ §13 |
| Dates | Build 3–4 Oct; **submission 4 Oct 09:00 ET**; winners notified 5–6 Oct; Seoul talk 21 Oct | WB FAQ §16, [Luma](https://luma.com/z3za7zow) |
| Prize | One representative per winning team presents at the Global AI & Digital Summit, Seoul (travel covered) | WB FAQ §17 |
| Ownership | Teams keep ownership of their submissions | WB FAQ §20 |
| Judging | "Expert judges"; no public rubric found | WB FAQ §15 |
| Hack-Nation sponsors | ElevenLabs, Bright Data, Lovable, OpenAI, Databricks (+ Supabase, Vercel and others in past editions) | [Hack-Nation](https://hack-nation.ai/), [Luma](https://luma.com/z3za7zow) |

**Inferred judging lens** (no published rubric, so this is our best reading of the World Bank framing):
1. **Problem fit and impact.** A real, specific, high-burden problem in low- and middle-income countries.
2. **Small AI fit.** It works under constraints: offline, low-end devices, voice/SMS, local data, low cost.
3. **Feasibility and scalability.** Could a ministry or World Bank project adopt it? Does it fit existing systems (digital public infrastructure, national health programmes)?
4. **Responsible AI.** Safety, human oversight, transparency, privacy, equity.
5. **Execution and demo.** It works live, and the story is clear in about 2 minutes.

---

## 2. What the World Bank (and WHO / UNESCO) care about

### World Bank
- **Small AI** (Digital Progress and Trends Report 2025, *Strengthening AI Foundations*): practical, local, affordable AI on everyday devices such as mobile phones, rather than frontier models. [WB Digital & AI](https://worldbank.org/ext/en/topic/digital-and-ai)
- **Health target:** help countries deliver quality, affordable health services to **1.5 billion people by 2030**, by reorienting systems toward **primary health care**. 375 million people reached so far, work in 45 countries, and **15 countries have National Health Compacts** (five-year reform plans). [WB feature, Dec 2025](https://www.worldbank.org/en/news/feature/2025/12/09/advancing-the-world-bank-group-goal-reaching-1-5-billion-people-with-quality-affordable-health-services-by-2030)
  → **Our hook:** primary care only works if the referral system works. CareGraph makes the primary-care level safe to rely on, because it gets the patients who need more care to the right place.
- They favour things that **plug into existing country systems** over yet another standalone app.

### WHO
- **SMART Guidelines / Digital Adaptation Kits.** WHO publishes generic, software-neutral requirements that countries adapt locally, with machine-readable versions as FHIR implementation guides. The antenatal-care kit and its FHIR guide exist. [WHO ANC IG](https://build.fhir.org/ig/WorldHealthOrganization/smart-anc/), [DAK SMBP](https://smart.who.int/dak-smbp/index.html)
  → Our versioned **Country Pack** (WHO baseline + local adaptation, every rule with source, version and validation status) follows **exactly this localisation model**.
- **Ethics and governance of AI for health (2021), six principles:** protect autonomy; promote well-being, safety and the public interest; transparency, explainability and intelligibility; responsibility and accountability; inclusiveness and equity; responsive and sustainable AI. [WHO](https://who.int/publications/i/item/9789240029200)
- **Regulatory considerations on AI for health (2023).** Covers documentation and transparency, risk management (including intended use, *continuous learning*, human intervention), external validation of data, data quality, privacy, and collaboration. [WHO](https://who.int/news/item/19-10-2023-who-outlines-considerations-for-regulation-of-artificial-intelligence-for-health)

### UNESCO
- **Recommendation on the Ethics of AI (2021, adopted by 193 states), ten principles:** proportionality and do no harm; safety and security; privacy; multi-stakeholder governance; responsibility and accountability; transparency and explainability; **human oversight and determination**; sustainability; awareness and literacy; fairness and non-discrimination. [summary](https://casrai.org/news/unesco-ai-ethics-recommendation)

### The problem's scale (citable)
- Haemorrhage and **hypertensive disorders of pregnancy** are the leading causes of maternal death: about **80,000 and about 50,000 deaths** respectively (WHO-led study, March 2025, 2020 data). [WHO news](https://www.who.int/news/item/08-03-2025-many-pregnancy-related-complications-going-undetected-and-untreated--who)
- Community-to-facility referral **completion** for sick newborns in Africa and Asia: **median 74%, range 34–97%**. One in four referred babies does not arrive. [BMC Public Health 2015 systematic review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4589085/)
- India alone has **over 1 million ASHA workers** (WHO Global Health Leaders Award 2022). This is the user base for a voice-first tool. [Drishti / NHM](https://www.drishtiias.com/daily-updates/daily-news-analysis/asha-workers-in-india)
- **Three delays model** (Thaddeus & Maine): maternal deaths result from delays in (1) deciding to seek care, (2) reaching care, and (3) receiving care. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5506640)

---

## 3. What we have built (status as of now)

The code is in this repo; see `README.md` for run instructions. 19 engine tests pass, the production build passes, and the bundle is about 100 KB gzipped.

| Layer | What exists | Real or simulated |
|---|---|---|
| Voice intake | ElevenLabs Scribe speech-to-text, multilingual spoken questions (EN/HI/BN), browser speech fallback | **Real integration, not yet tested with a live key**; pre-transcribed fallback works offline |
| Extraction | Deterministic, negation-aware lexicon extractor + Hindi glossary; every fact tagged OBSERVED / REPORTED / INFERRED / UNKNOWN | Real |
| Protocol engine | Three-valued logic (TRUE / FALSE / UNKNOWN; UNKNOWN never becomes "no"; inferred facts never fire rules). Two versioned protocols (maternal, pediatric) carrying WHO-baseline and country-pack provenance | Real logic; **protocol content is a demo encoding, not clinically validated** |
| Next question | Picks the question by expected change in the decision; the patient's history adjusts the odds; questioning stops immediately when an emergency rule fires; stops when questions add little value | Real; the odds are labelled demo values |
| Evidence graph | Findings → problem clusters → actions; edges carry sources; cluster priority = risk × (evidence + expected evidence of unknowns); high-risk clusters stay flagged "cannot be excluded" (e.g. safeguarding) | Real logic; demo weights |
| Uncertainty | 7 dimensions (completeness, conflict, action, diagnostic, operational, acknowledgement, time); no single "AI confidence %" | Real |
| Expert council | Smallest set of experts covering the required expertise within the urgency window; async members don't block; quorum and consensus; peer advice stored as case-specific, never written into global knowledge; conflicts surfaced | Real logic; **clinicians and their replies simulated** |
| Facility routing | Capability + specialist on duty + 24x7 + accepting + status freshness + travel time → top 3, with "why not the nearest" | Real logic; **12 fictional facilities, simulated status feed** |
| Forecasting | Time-to-care forecast (real arithmetic on simulated travel times); deterioration-risk forecast deliberately **blocked: no validated model registered** | Governance demonstrated |
| Execution | Referral state machine (17 states, invalid transitions throw), transport state machine, escalation when the facility doesn't respond, human authorization gates, counter-referral closes the loop | Real logic; **dispatch simulated** |
| Audit | Every tool call, rule, transition, authorization and human response, each with its evidence class | Real |
| UI | Worker conversation on the left; agent pipeline on the right (Understand → Triage → Uncertainty → Council → Where to go → Transport); details drawer | Real; Lovable-compatible stack |
| Lovable / Supabase | Vite + React + Tailwind project shape; Supabase Edge Functions for ElevenLabs | Code present; **not yet deployed to Lovable** |

**Known issues:**
- You reported that the flow **does not progress after the BP answer (case A) and after the first answer (case B)** when used by hand. The automated browser run passes, so this is likely an interaction path the test doesn't cover (typing, mic, or reload/hot-reload state). **Fix before anything else.**
- **Too case-specific.** A "scenario" currently binds patient + protocol + scripted responders, and the UI shows scenario tabs. The engine is generic, but the experience looks like two hard-coded demos. Fix: the agent **selects the pathway itself** (a `select_pathway` tool over the protocol library), the worker picks a patient from their household register, and the demo scripts become sample voice notes rather than tabs.

---

## 4. What we can claim, and what we must not

### Defensible claims
1. **"Small AI by composition, not model size."** No large model is needed at runtime. Deterministic protocols, a small evidence graph, value-of-information questioning and routing run **on-device and offline** (about 100 KB). The network is used only to send the referral.
2. **"Never assumes missing information."** UNKNOWN is a first-class state in the protocol engine (three-valued logic, consistent with how WHO's computable guidelines treat missing data). INFERRED facts cannot fire rules.
3. **"Asks only what changes the decision, and stops when care can't wait."** Value-of-information selection plus a hard stop on emergency rules.
4. **"Country-adaptable by configuration."** A versioned Country Pack, WHO baseline + local adaptation, every rule carrying provenance. This mirrors WHO's SMART / DAK localisation model.
5. **"Nearest is not appropriate."** Capability- and availability-aware routing, top 3 with reasons.
6. **"When it doesn't know, it finds the smallest council that does."** Expert routing within urgency windows; human opinions kept case-specific.
7. **"Stays until handoff."** A closed loop through acceptance, transport, arrival and counter-referral, with a full audit trail.
8. **"Responsible by design."** A mapping to WHO's six ethics principles, WHO's regulatory considerations and UNESCO's ten principles (§6).

### Must not claim
- Clinical validation, ministry approval or WHO endorsement. Say "encoded from public WHO guidance, demo-validated only".
- Real integrations with facilities, ambulances (108) or WhatsApp. Say "simulated behind real interfaces".
- Calibrated probabilities or diagnostic accuracy.
- "Trained a model", **unless we actually run the calibration loop** (§8). Even then say "calibrated on synthetic outcomes".
- Lives saved. Present an impact *model* with stated assumptions and say what a pilot would measure.

---

## 5. How CareGraph differs from what already exists

| Existing | What it does well | Where CareGraph adds value |
|---|---|---|
| WHO SMART Guidelines / DAKs | Authoritative, computable clinical logic for countries to adapt | CareGraph **executes** that logic under uncertainty, decides what to ask, and turns a fired rule into an executed referral |
| Community health worker apps (e.g. Medic Community Health Toolkit, OpenSRP, CommCare, national apps) | Forms, registers, task lists, follow-up | CareGraph is an **orchestration service behind them** (API / SMS / voice): routing on live capability, expert councils, closed loop. Not another app to learn |
| Telemedicine (e.g. India's eSanjeevani) | Doctor consults | CareGraph decides **when** a consult is needed, **who** (smallest council) and **what minimal packet** to send, so scarce expert time is protected |
| Symptom checkers / LLM chatbots | Conversational triage | Deterministic red flags, explicit unknowns, provenance, human authorization. No free-form model makes the safety decision |
| Health information systems (DHIS2, HMIS) | Aggregate reporting | CareGraph produces structured referral and outcome events that **feed** them, and that later calibrate the system |

**Positioning line:** *WHO tells us what good care looks like. Countries know how their health systems actually work. CareGraph connects the two at the moment a frontline worker is unsure, and stays until the patient reaches care.*

Claim this as "a gap we address", never "nobody does referral". Several of these systems track referrals; few combine routing on live capability, uncertainty-aware escalation and a closed loop.

---

## 6. Compliance mapping (judges and World Bank reviewers will ask)

| Requirement | CareGraph feature |
|---|---|
| WHO 1 · Protect autonomy | The human authorizes every external action; the AI recommends, people decide; consent noted before peer sharing |
| WHO 2 · Well-being, safety, public interest | Deterministic red flags; emergency stop on questioning; no model can override a fired rule |
| WHO 3 · Transparency, explainability | "Why?" on every decision: rule, source, version, the facts used, the evidence graph |
| WHO 4 · Responsibility, accountability | Audit trail with actor and evidence class; peer opinions attributed to the clinician and case |
| WHO 5 · Inclusiveness, equity | Voice-first, Hindi/Bengali, runs offline on low-end devices; worker's kit determines which questions are asked |
| WHO 6 · Responsive, sustainable | Outcome feedback (counter-referral) drives calibration under human governance; tiny compute footprint |
| WHO regulatory · documentation and transparency | Versioned protocol, country pack and evidence graph, each with source, effective date and validation status |
| WHO regulatory · risk management, continuous learning | Learnable values limited to odds and operational estimates; rules and thresholds change only through approved versions |
| WHO regulatory · intended use, validation | Stated intended use (referral decision support); "demo-validated"; validated-model-only gate on risk forecasting |
| WHO regulatory · privacy | Minimum-necessary peer packet; synthetic data only; secrets kept server-side |
| UNESCO · proportionality, do no harm | The smallest tool that works: deterministic rules first, a language model optional and never safety-critical |
| UNESCO · human oversight and determination | Authorization gates; council for ambiguous cases; disagreement surfaced, not auto-resolved |
| UNESCO · fairness | Same logic for every patient; no demographic scoring; routes by capability, not by facility type or ownership |
| UNESCO · awareness and literacy | Plain-language "why" for workers; Hindi/Bengali questions |

**Gaps to admit:** no bias evaluation yet; no clinical validation; no data-protection impact assessment; no real consent flow.

---

## 7. Impact: how judges will score it, and how we show it

Judges will look for **(a) a big, specific burden, (b) a believable mechanism, (c) evidence it can scale cheaply.** Use the three delays as the spine:

| Delay | What happens today | What CareGraph does | What a pilot would measure |
|---|---|---|---|
| **1. Deciding** | Worker unsure whether this is an emergency; static checklists; history not at hand | History + one decisive question (BP) → rule fires → "refer now" in about 2 minutes | Time from first contact to decision; questions per case; missed red flags |
| **2. Reaching** | Patient sent to the nearest facility, which can't help, then a second transfer; no transport | Capability-aware destination + ambulance requested in parallel | % of referrals reaching a capable facility first time; secondary transfers avoided; time to definitive care |
| **3. Receiving** | Facility unprepared; referral note lost | Minimal packet + pre-acceptance + tracked handoff | Time to acceptance; handoff completeness; counter-referral rate |

**Impact card to add at the end of each case:**
- Time to safe action (demo clock).
- Questions asked versus a full checklist.
- Facilities avoided that could not have helped, and minutes saved compared with "nearest, then re-refer".
- Specialist minutes used: none in case A; about 2 short replies in case B.
- Unknowns carried forward explicitly.

**Illustrative district model (label it as assumptions):** a district of about 2 million people has about 40,000 pregnancies a year. If 5–10% involve hypertensive disorders, that is 2,000–4,000 women a year. If a quarter reach severe range, that is 500–1,000 emergency referrals where destination choice and minutes matter. Every percentage point of first-time-right referral is roughly 5–10 women a year per district who avoid a secondary transfer. **Present this as a measurement plan, not a result.**

---

## 8. Learnability: our biggest differentiator (build a thin version)

**The closed loop creates labels.** Every counter-referral tells us what the facility actually found.

- **Learns automatically (bounded, shrunk toward the WHO/country baseline):** question odds (e.g. how often BP comes back ≥160 given this history), evidence-graph weights, worker report reliability, facility acceptance and response times, real travel times, expert response times.
- **Never learns automatically:** red-flag rules, thresholds, pathways. Large drifts become **"proposed update, awaiting clinician approval"**, versioned like the country pack.

**Thin demo (about 2–3 h):** generate a synthetic cohort of about 300 closed referrals from a documented simulator, update the odds by Bayesian updating, and show a before/after calibration chart plus one "proposed update" card. **Claim:** "learning loop demonstrated on synthetic outcomes; real calibration needs deployment data". This is honest and directly answers WHO's "continuous learning" consideration.

---

## 9. Sponsors and partners: how we honestly use them

| Partner | Current use | Quick upgrade (if time) | How to say it |
|---|---|---|---|
| **ElevenLabs** | Scribe speech-to-text for the worker's voice note (original transcript kept); multilingual spoken questions in Hindi/Bengali | Live key test; **phone-call mode** via ElevenLabs Agents so the worker *calls* CareGraph from a basic phone | "ElevenLabs is the **access layer**: a worker with no new app, speaking Hindi, gets a spoken question back." Scribe benchmark: Hindi word error rate about 5.5% on FLEURS ([ElevenLabs](https://elevenlabs.io/speech-to-text/hindi)) |
| **Lovable** | Repo built in Lovable's stack; Supabase Edge Functions ready | Import via GitHub sync; deploy on Lovable Cloud with the ElevenLabs secret; iterate the judge-facing UI there | "The judge-facing surface was built and deployed with Lovable; the clinical engine is a separate, protected module" |
| **Bright Data** | Not yet | **"Verify source" action:** fetch the allow-listed WHO page behind a rule, show retrieved / timestamp / claim-source match; fetch a public facility page for operational context. Bright Data's MCP server offers 5,000 free requests a month ([docs](https://docs.brightdata.com/products/mcp-server/overview)) | "Bright Data is the **live-context layer** for allow-listed public sources. Retrieved clinical claims stay UNVERIFIED and never become rules" |
| **OpenAI** | Not yet | Optional extractor behind the same interface using **gpt-oss-20b (open-weight, runs in 16 GB, Apache 2.0)**: fully local, still small AI ([TechRadar](https://www.techradar.com/ai-platforms-assistants/chatgpt/how-to-run-openais-gpt-oss-ai-models-on-your-laptop)) | "An optional on-premise open-weight language layer; never safety-critical" |
| **Databricks** | Not yet | Host the calibration loop: outcome events → Delta table → nightly Bayesian update → proposed-update queue | Only claim it if we actually build it |
| **Supabase** (via Lovable Cloud) | Edge Functions written | Store referral and outcome events | "Event store for the closed loop" |

Rule: **claim only what is wired in by submission time.** Everything else goes on a "roadmap" slide.

---

## 10. Data: what we can use or claim

1. **The organisers' health dataset (priority 1).** Find it on the Hack-Nation platform. If it contains facilities, cases or surveillance, wire it in: replace our fictional facilities, or replay real cases through the engine.
2. **Open facility data:** healthsites.io / OpenStreetMap health facilities (open licence, API, GeoJSON) for one real Indian district. Real locations, simulated status. [healthsites](https://wiki.openstreetmap.org/wiki/Global_Healthsites_Mapping_Project)
3. **WHO SMART ANC guide:** cite our maternal rules against its decision logic; consider importing a few decision tables as data. [WHO ANC IG](https://build.fhir.org/ig/WorldHealthOrganization/smart-anc/)
4. **A synthetic outcome cohort** for the calibration demo (§8), with the generator and assumptions documented in the repo.

---

## 11. Demo plan (video under 2 minutes; live version the same)

1. **(10 s) A person, not architecture.** "Asha is one of India's million ASHAs. A pregnant patient has a severe headache."
2. **(20 s) Voice in, structure out.** A Hindi voice note goes in; facts appear; *visual disturbance UNKNOWN*. "It never assumes."
3. **(15 s) One question.** "Can you measure her BP?" is spoken back in Hindi. 166/108. A red rule bubble: *"Further questioning will not delay referral."*
4. **(25 s) Nearest ≠ appropriate.** Top 3 places; the 7 closer facilities rejected with reasons; council *not convened* because the rule is decisive.
5. **(15 s) Execute.** One tap authorizes; the packet arrives WhatsApp-style; the obstetrician ACCEPTS; the ambulance moves; **handoff complete**.
6. **(20 s) When protocol isn't enough.** The child case: two questions, value runs out, a three-person council, consensus, safeguarding kept visible.
7. **(15 s) Why it's small AI and why it scales.** About 100 KB, offline, country pack, learns from outcomes under human approval. Close: *"When CareGraph knows enough, it acts. When it doesn't, it asks. When it still doesn't know, it finds someone who does."*

**Show at least once:** a phone-sized frame (the worker's view over voice/SMS) next to the dashboard (the judges' view of the reasoning).

---

## 12. Plan to win: prioritised work to the deadline

| # | Task | Why | Est. |
|---|---|---|---|
| 1 | **Fix the stall after the first answer** (reproduce by hand; cover typed, clicked, mic and reload paths) | A broken demo loses outright | 0.5–1 h |
| 2 | **Get and use the organisers' health dataset** | Judges expect it; "local data" is in the brief | 1–2 h |
| 3 | **Generic intake:** the agent selects the pathway; patient picker; demo scripts as sample voice notes | Answers "why is it built for one case?" | 1.5 h |
| 4 | **Phone-frame worker view + SMS rendering** of questions and packets | Matches "SMS and voice" in the brief | 1.5 h |
| 5 | **Impact card** (three delays + metrics) | Makes impact scorable | 1 h |
| 6 | **Live ElevenLabs test** (key in `.env` or Lovable secret) | Sponsor use plus wow | 0.5 h |
| 7 | Deploy to Lovable (GitHub sync, Cloud secret) | Shareable link for judges | 1 h |
| 8 | Calibration-loop demo (§8) | Learnability differentiator | 2–3 h |
| 9 | Bright Data "verify source" | Sponsor plus provenance story | 1.5 h |
| 10 | Video + submission text + slides | Required | 2 h, in parallel |

Cut line if time runs short: ship tasks 1–7 and 10; tasks 8 and 9 go on the roadmap slide.

---

## 13. Judge Q&A prep

- **"Isn't this just rules? Where's the AI?"** The AI is in deciding what to ask (value of information), which problem clusters matter (evidence graph), whom to escalate to, where to send the patient, and learning from outcomes. Safety-critical steps are deliberately deterministic: that is responsible small AI, not a limitation.
- **"How do you scale to another country?"** Swap the country pack (protocols, referral levels, emergency numbers, languages) and the facility registry. The engine is unchanged.
- **"What about connectivity?"** Assessment runs offline on the phone; only the referral message needs a network, and SMS works on 2G.
- **"Who is liable?"** Decisions trace to versioned, ministry-approved rules and to authorized humans. The audit log records who, what and why.
- **"How do you know it works?"** Today: tests and synthetic cases. Pilot: the three-delay metrics in §7, compared with routine referral registers.
- **"Why not just use a large language model?"** Cost, connectivity, hallucination risk and regulatory acceptability. A language model can add language understanding behind our interface but never makes the safety decision.

---

## Sources
- [World Bank, Small AI for Development Hackathon FAQ](https://thedocs.worldbank.org/en/doc/a2d80d7a647019e16e7265a3563ce416-0320012026/original/Small-AI-for-Development-Hackathon-FAQs.pdf)
- [ADB Challenges: Small AI for Development Hackathon (World Bank)](https://challenges.adb.org/en/challenges/small-ai-for-development-hackathon)
- [Hack-Nation 7th Global AI Hackathon (Luma)](https://luma.com/z3za7zow) · [Hack-Nation](https://hack-nation.ai/)
- [World Bank: Digital and AI](https://worldbank.org/ext/en/topic/digital-and-ai)
- [World Bank: Reaching 1.5 billion people with quality, affordable health services by 2030](https://www.worldbank.org/en/news/feature/2025/12/09/advancing-the-world-bank-group-goal-reaching-1-5-billion-people-with-quality-affordable-health-services-by-2030)
- [WHO SMART ANC FHIR Implementation Guide](https://build.fhir.org/ig/WorldHealthOrganization/smart-anc/) · [WHO DAK SMBP](https://smart.who.int/dak-smbp/index.html)
- [WHO: Ethics and governance of AI for health](https://who.int/publications/i/item/9789240029200)
- [WHO: Regulatory considerations on AI for health](https://who.int/news/item/19-10-2023-who-outlines-considerations-for-regulation-of-artificial-intelligence-for-health)
- [UNESCO Recommendation on the Ethics of AI (summary)](https://casrai.org/news/unesco-ai-ethics-recommendation)
- [WHO: pregnancy-related complications going undetected (March 2025)](https://www.who.int/news/item/08-03-2025-many-pregnancy-related-complications-going-undetected-and-untreated--who)
- [Systematic review: community-to-facility neonatal referral completion](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4589085/)
- [Three delays model (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5506640)
- [ASHA workers (Drishti IAS)](https://www.drishtiias.com/daily-updates/daily-news-analysis/asha-workers-in-india)
- [ElevenLabs Hindi speech-to-text](https://elevenlabs.io/speech-to-text/hindi)
- [Bright Data MCP server](https://docs.brightdata.com/products/mcp-server/overview)
- [gpt-oss on laptops (TechRadar)](https://www.techradar.com/ai-platforms-assistants/chatgpt/how-to-run-openais-gpt-oss-ai-models-on-your-laptop)
- [Global Healthsites Mapping Project](https://wiki.openstreetmap.org/wiki/Global_Healthsites_Mapping_Project)
