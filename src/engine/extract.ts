import type { EvidenceClass, Fact, FactStatus, FactValue } from './types';

/**
 * Small, deterministic, offline extractor (the default "small AI" language layer).
 * It only emits facts that the text explicitly supports. Anything not mentioned is
 * left absent → UNKNOWN downstream. An optional LLM extractor can replace this,
 * but must return the same shape and is subject to the same rules.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

/** "thirty-one" → "31", "one hundred sixty six" → "166". */
const NUM_WORD = `(?:${[...Object.keys(UNITS), ...Object.keys(TENS), 'hundred'].join('|')})`;
const NUM_RUN = new RegExp(`\\b${NUM_WORD}(?:[\\s-]+${NUM_WORD})*\\b`, 'gi');

export function wordsToDigits(text: string): string {
  return text.replace(NUM_RUN, (run) => {
    const nums: number[] = [];
    let cur: number | null = null;
    let last: 'unit' | 'tens' | 'hundred' | null = null;
    for (const p of run.toLowerCase().split(/[\s-]+/)) {
      if (p === 'hundred') {
        cur = (cur ?? 1) * 100;
        last = 'hundred';
      } else if (p in TENS) {
        if (cur !== null && last === 'hundred') cur += TENS[p];
        else {
          if (cur !== null) nums.push(cur);
          cur = TENS[p];
        }
        last = 'tens';
      } else {
        if (cur !== null && (last === 'tens' || last === 'hundred')) cur += UNITS[p];
        else {
          if (cur !== null) nums.push(cur);
          cur = UNITS[p];
        }
        last = 'unit';
      }
    }
    if (cur !== null) nums.push(cur);
    return nums.join(' ');
  });
}

/**
 * Tiny Hindi → English glossary normalisation so Hindi transcripts (ElevenLabs Scribe)
 * flow through the same deterministic extractor. Demo coverage only — a production
 * country pack would ship a validated local-terminology value set.
 */
const HI_GLOSSARY: [RegExp, string][] = [
  [/(\d+)\s*साल(?:\s*की|\s*का)?/g, '$1 years old '],
  [/(\d+)\s*(?:हफ़्ते|हफ्ते|सप्ताह)/g, '$1 weeks '],
  [/महिला|औरत/g, ' woman '],
  [/लड़का|बच्चा/g, ' boy '],
  [/लड़की|बच्ची/g, ' girl '],
  [/गर्भवती|प्रेग्नेंट/g, ' pregnant '],
  [/(?:तेज़|तेज|बहुत ज़्यादा|बहुत ज्यादा)\s*सिरदर्द|(?:तेज़|तेज)\s*सिर\s*दर्द/g, ' severe headache '],
  [/सिरदर्द|सिर\s*दर्द/g, ' headache '],
  [/सुबह से/g, ' since morning '],
  [/सूजन/g, ' swelling '],
  [/चक्कर/g, ' dizzy '],
  [/धुंधला(?:\s*दिख(?:ना|रहा))?/g, ' blurred vision '],
  [/दौरा|झटके/g, ' fits '],
  [/खून आना|रक्तस्राव/g, ' bleeding '],
  [/बुखार/g, ' fever '],
  [/बदन\s*दर्द|शरीर\s*में\s*दर्द/g, ' body aches '],
  [/नहीं/g, ' no '],
  [/और/g, ' and '],
];

export function normalizeHindi(text: string): string {
  if (!/[\u0900-\u097F]/.test(text)) return text;
  let t = text;
  for (const [re, en] of HI_GLOSSARY) t = t.replace(re, en);
  return t.replace(/[\u0900-\u097F।]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const NEGATORS = /\b(no|not|denies|denied|without|never|nor|none)\b[^.,;]{0,25}$/;

function negated(text: string, idx: number): boolean {
  return NEGATORS.test(text.slice(Math.max(0, idx - 30), idx));
}

export interface Extraction {
  facts: Fact[];
  normalized: string;
}

interface Hit {
  key: string;
  value: FactValue;
  status?: FactStatus;
  confidence: number;
  quote: string;
  note?: string;
}

/** Find a term; returns hit with value=true, or false if negated. */
function term(text: string, key: string, re: RegExp, confidence: number, note?: string): Hit | null {
  const m = re.exec(text);
  if (!m) return null;
  const neg = negated(text, m.index);
  return { key, value: !neg, confidence: neg ? Math.min(confidence, 0.85) : confidence, quote: m[0], note };
}

export function extractCase(raw: string, opts: { source: string; at: number; evidence?: EvidenceClass }): Extraction {
  const text = wordsToDigits(normalizeHindi(raw)).toLowerCase();
  const hits: Hit[] = [];
  const push = (h: Hit | null) => h && hits.push(h);

  // Demographics
  const age = /(\d{1,2})\s*[- ]?\s*(?:years?|yrs?|y)\s*[- ]?\s*old|\baged?\s+(\d{1,2})\b/.exec(text);
  if (age) hits.push({ key: 'age_years', value: Number(age[1] ?? age[2]), confidence: 0.97, quote: age[0] });
  const female = /\b(woman|female|girl|mother|lady|she|her)\b/.exec(text);
  const male = /\b(man|male|boy|he|his|him)\b/.exec(text);
  if (female && (!male || female.index < male.index)) hits.push({ key: 'sex', value: 'F', confidence: 0.9, quote: female[0] });
  else if (male) hits.push({ key: 'sex', value: 'M', confidence: 0.9, quote: male[0] });

  // Pregnancy
  const ga = /(\d{1,2})\s*(?:weeks?|wks?)\s*(?:pregnant|of pregnancy|gestation|along)?/.exec(text);
  const preg = /\bpregnan(t|cy)\b|\bexpecting\b|\bgestation/.exec(text);
  if (preg) push({ key: 'pregnant', value: !negated(text, preg.index), confidence: 0.97, quote: preg[0] });
  if (ga && preg) hits.push({ key: 'gestational_weeks', value: Number(ga[1]), confidence: 0.95, quote: ga[0] });

  // Maternal danger signs
  const sevHead = /\b(severe|bad|terrible|very bad|strong|intense|worst)\s+headache/.exec(text);
  if (sevHead) push({ key: 'severe_headache', value: !negated(text, sevHead.index), confidence: 0.95, quote: sevHead[0] });
  const head = term(text, 'headache', /\bheadaches?\b|\bhead (?:is )?(?:hurting|pain)/, 0.95);
  if (head && !sevHead && head.value) head.note = 'Severity not stated — severe headache remains UNKNOWN';
  push(head);
  const onset = /\bsince (this )?(morning|yesterday|last night|\d+ (?:days?|hours?))|\bfor (\d+ (?:days?|hours?))/.exec(text);
  if (onset) hits.push({ key: 'symptom_onset', value: onset[0], confidence: 0.9, quote: onset[0] });
  const swell = /\b(swelling|swollen|oedema|edema|puffy)\b(?:\s+(?:of|in)\s+(?:the\s+)?(face|hands|feet|legs|ankles))?/.exec(text);
  if (swell) {
    const site = swell[2];
    push({
      key: 'edema', value: !negated(text, swell.index), confidence: site ? 0.92 : 0.8, quote: swell[0],
      note: site ? `Site: ${site}` : 'Site not specified',
    });
  }
  push(term(text, 'dizziness', /\bdizz(y|iness)\b|\blight-?headed/, 0.9));
  push(term(text, 'visual_disturbance', /\b(blurr?(?:ed|y) vision|vision (?:is )?(?:blurr?(?:ed|y)|problems?)|seeing (?:spots|flashes|stars)|can'?t see (?:properly|clearly))/, 0.9));
  push(term(text, 'convulsions', /\b(fits?|seizures?|convuls(?:ion|ions|ing)|jerking)\b/, 0.92));
  push(term(text, 'vaginal_bleeding', /\b(vaginal )?bleeding\b/, 0.85));
  push(term(text, 'epigastric_pain', /\b(upper (?:abdominal|stomach|belly) pain|epigastric pain|pain (?:in|below) (?:the )?(?:upper abdomen|ribs))/, 0.88));

  // Blood pressure (measured now)
  const bp = /\b(?:bp|blood pressure)?\s*(?:is|of|=|:)?\s*(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/.exec(text);
  if (bp) {
    const s = Number(bp[1]);
    const d = Number(bp[2]);
    if (s >= 60 && s <= 260 && d >= 30 && d <= 160 && s > d) {
      hits.push({ key: 'sbp', value: s, status: 'OBSERVED', confidence: 0.97, quote: bp[0].trim() });
      hits.push({ key: 'dbp', value: d, status: 'OBSERVED', confidence: 0.97, quote: bp[0].trim() });
    }
  }

  // Pediatric bone fragility
  const ord = /\b(first|second|third|fourth|fifth|sixth)\s+(?:broken bone|fracture)/.exec(text);
  const cnt = /\b(\d)\s+(?:broken bones|fractures)\b/.exec(text);
  if (ord) hits.push({ key: 'fracture_count', value: ORDINALS[ord[1]], confidence: 0.9, quote: ord[0] });
  else if (cnt) hits.push({ key: 'fracture_count', value: Number(cnt[1]), confidence: 0.9, quote: cnt[0] });
  const count = ord ? ORDINALS[ord[1]] : cnt ? Number(cnt[1]) : 0;
  if (count >= 2 || /\brecurrent fractures?\b|\bkeeps? breaking\b/.test(text))
    hits.push({ key: 'recurrent_fracture', value: true, confidence: 0.92, quote: ord?.[0] ?? cnt?.[0] ?? 'recurrent fracture' });
  const easy = /\b(happen easily|break easily|breaks? easily|minor falls?|little force|without (?:much|major) (?:injury|trauma))\b/.exec(text);
  if (easy)
    hits.push({
      key: 'low_trauma', value: true, status: 'INFERRED', confidence: 0.6, quote: easy[0],
      note: 'Probable — mechanism not described; needs confirmation',
    });
  push(term(text, 'short_stature', /\bshort (?:for (?:his|her|their) age|stature)|\bsmall for (?:his|her) age/, 0.85));
  push(term(text, 'blue_sclera', /\b(blue|grey|gray|bluish) (?:sclera|whites of (?:the |his |her )?eyes)|whites of (?:his |her |the )?eyes (?:look |are )?(?:blue|grey|gray|bluish)/, 0.88));
  push(term(text, 'hearing_impairment', /\b(hearing (?:problems?|loss|difficulty)|hard of hearing|can'?t hear)/, 0.88));

  // Fever syndrome
  push(term(text, 'fever', /\bfever|febrile|high temperature\b/, 0.93));
  push(term(text, 'myalgia', /\bbody ?aches?|myalgia|muscle (?:pain|aches?)/, 0.9));

  // De-duplicate (first hit per key wins)
  const seen = new Set<string>();
  const facts: Fact[] = [];
  for (const h of hits) {
    if (seen.has(h.key)) continue;
    seen.add(h.key);
    const status: FactStatus = h.status ?? (h.key === 'sbp' || h.key === 'dbp' ? 'OBSERVED' : 'REPORTED');
    facts.push({
      key: h.key,
      value: h.value,
      status,
      source: opts.source,
      evidence: status === 'INFERRED' ? 'MODEL_INFERENCE' : status === 'OBSERVED' ? 'FRONTLINE_MEASUREMENT' : opts.evidence ?? 'FRONTLINE_REPORT',
      at: opts.at,
      extractionConfidence: h.confidence,
      quote: h.quote,
      note: h.note,
    });
  }
  return { facts, normalized: text };
}

/** Parse a BP answer like "166/108", "166 over 108". */
export function parseBP(input: string): { sbp: number; dbp: number } | null {
  const m = /(\d{2,3})\s*(?:\/|over|on)\s*(\d{2,3})/.exec(wordsToDigits(input).toLowerCase());
  if (!m) return null;
  const sbp = Number(m[1]);
  const dbp = Number(m[2]);
  if (sbp < 60 || sbp > 260 || dbp < 30 || dbp > 160 || sbp <= dbp) return null;
  return { sbp, dbp };
}
