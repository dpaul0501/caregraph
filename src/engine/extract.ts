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

/** Bengali → English glossary (demo coverage; a country pack would ship a validated value set). */
const BN_GLOSSARY: [RegExp, string][] = [
  [/(\d+)\s*বছর(?:ের)?/g, '$1 years old '],
  [/(\d+)\s*সপ্তাহ(?:ের)?/g, '$1 weeks '],
  [/মহিলা|নারী|মেয়ে/g, ' woman '],
  [/ছেলে|বাচ্চা/g, ' boy '],
  [/গর্ভবতী|অন্তঃসত্ত্বা/g, ' pregnant '],
  [/(?:খুব|প্রচণ্ড|তীব্র)\s*মাথা\s*ব্যথা|(?:খুব|প্রচণ্ড|তীব্র)\s*মাথাব্যথা/g, ' severe headache '],
  [/মাথা\s*ব্যথা|মাথাব্যথা/g, ' headache '],
  [/সকাল থেকে/g, ' since morning '],
  [/ফোলা|ফুলে/g, ' swelling '],
  [/মাথা ঘোরা/g, ' dizzy '],
  [/ঝাপসা/g, ' blurred vision '],
  [/খিঁচুনি/g, ' fits '],
  [/রক্তপাত/g, ' bleeding '],
  [/জ্বর/g, ' fever '],
  [/শ্বাসকষ্ট/g, ' difficulty breathing '],
  [/অজ্ঞান|সাড়া দিচ্ছে না/g, ' unconscious '],
  [/না\b/g, ' no '],
  [/আর|এবং/g, ' and '],
];

/** Hindi and Bengali number words 1–50 (speech-to-text writes ages/weeks as words). Longest first. */
const NATIVE_NUMBER_WORDS: [string, number][] = [
  ['পঁয়তাল্লিশ', 45],
  ['বিয়াল্লিশ', 42],
  ['চুয়াল্লিশ', 44],
  ['পঁয়ত্রিশ', 35],
  ['সাঁইত্রিশ', 37],
  ['তেতাল্লিশ', 43],
  ['সাতচল্লিশ', 47],
  ['तैंतालीस', 43],
  ['पैंतालीस', 45],
  ['सैंतालीस', 47],
  ['अड़तालीस', 48],
  ['ঊনচল্লিশ', 39],
  ['একচল্লিশ', 41],
  ['ছেচল্লিশ', 46],
  ['আটচল্লিশ', 48],
  ['ঊনপঞ্চাশ', 49],
  ['सत्ताईस', 27],
  ['अट्ठाईस', 28],
  ['उनतालीस', 39],
  ['इकतालीस', 41],
  ['छियालीस', 46],
  ['ছাব্বিশ', 26],
  ['ঊনত্রিশ', 29],
  ['একত্রিশ', 31],
  ['তেত্রিশ', 33],
  ['চৌত্রিশ', 34],
  ['আটত্রিশ', 38],
  ['ग्यारह', 11],
  ['पंद्रह', 15],
  ['उन्नीस', 19],
  ['इक्कीस', 21],
  ['पच्चीस', 25],
  ['छब्बीस', 26],
  ['बत्तीस', 32],
  ['तैंतीस', 33],
  ['चौंतीस', 34],
  ['पैंतीस', 35],
  ['छत्तीस', 36],
  ['सैंतीस', 37],
  ['अड़तीस', 38],
  ['बयालीस', 42],
  ['चवालीस', 44],
  ['চব্বিশ', 24],
  ['বত্রিশ', 32],
  ['ছত্রিশ', 36],
  ['চল্লিশ', 40],
  ['পঞ্চাশ', 50],
  ['सत्रह', 17],
  ['अठारह', 18],
  ['चौबीस', 24],
  ['उनतीस', 29],
  ['इकतीस', 31],
  ['चालीस', 40],
  ['उनचास', 49],
  ['এগারো', 11],
  ['চোদ্দ', 14],
  ['পনেরো', 15],
  ['সতেরো', 17],
  ['আঠারো', 18],
  ['পঁচিশ', 25],
  ['সাতাশ', 27],
  ['ত্রিশ', 30],
  ['पाँच', 5],
  ['बारह', 12],
  ['तेरह', 13],
  ['चौदह', 14],
  ['सोलह', 16],
  ['बाईस', 22],
  ['तेईस', 23],
  ['पचास', 50],
  ['পাঁচ', 5],
  ['বারো', 12],
  ['তেরো', 13],
  ['ষোলো', 16],
  ['উনিশ', 19],
  ['একুশ', 21],
  ['বাইশ', 22],
  ['তেইশ', 23],
  ['আঠাশ', 28],
  ['तीन', 3],
  ['चार', 4],
  ['सात', 7],
  ['बीस', 20],
  ['तीस', 30],
  ['দুই', 2],
  ['তিন', 3],
  ['চার', 4],
  ['ছয়', 6],
  ['সাত', 7],
  ['নয়', 9],
  ['বিশ', 20],
  ['एक', 1],
  ['दो', 2],
  ['छह', 6],
  ['आठ', 8],
  ['नौ', 9],
  ['दस', 10],
  ['এক', 1],
  ['আট', 8],
  ['দশ', 10],
];

/** Devanagari and Bengali digits and number words → ASCII digits. */
function nativeDigits(text: string): string {
  let t = text.replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966)).replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
  if (!/[\u0900-\u09FF]/.test(t)) return t;
  for (const [w, n] of NATIVE_NUMBER_WORDS) t = t.replace(new RegExp(`(^|[\\s,।.])${w}(?=[\\s,।.]|$)`, 'g'), `$1${n}`);
  return t;
}

export function normalizeHindi(raw: string): string {
  let t = nativeDigits(raw);
  if (/[\u0980-\u09FF]/.test(t)) {
    for (const [re, en] of BN_GLOSSARY) t = t.replace(re, en);
    t = t.replace(/[\u0980-\u09FF।]+/g, ' ');
  }
  if (/[\u0900-\u097F]/.test(t)) {
    for (const [re, en] of HI_GLOSSARY) t = t.replace(re, en);
    t = t.replace(/[\u0900-\u097F।]+/g, ' ');
  }
  return t === raw ? raw : t.replace(/\s+/g, ' ').trim();
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
  push(term(text, 'chest_pain', /\bchest (?:pain|tightness)\b/, 0.9));
  push(term(text, 'breathlessness', /\b(difficulty breathing|short(?:ness)? of breath|breathless(?:ness)?|can'?t breathe|trouble breathing)\b/, 0.9));
  push(term(text, 'abdominal_pain', /\b(abdominal pain|stomach pain|belly pain|pain in (?:the|her) (?:abdomen|stomach|belly))\b/, 0.85));
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

  // General danger signs (WHO ETAT / IMCI)
  push(term(text, 'unconscious', /\b(unconscious|not responding|unresponsive|fainted|passed out|very drowsy)\b/, 0.88));
  push(term(text, 'unable_to_drink', /\b(can'?t drink|cannot drink|unable to drink|vomit(?:s|ing)? everything)\b/, 0.88));
  push(term(text, 'severe_bleeding', /\b(heavy bleeding|bleeding (?:a lot|heavily)|lots of blood)\b/, 0.88));

  // Fever syndrome
  push(term(text, 'fever', /\bfever|febrile|high temperature\b/, 0.93));
  push(term(text, 'myalgia', /\bbody ?aches?|myalgia|muscle (?:pain|aches?)/, 0.9));

  // Knowledge coverage: something was described, but nothing maps to a known clinical finding.
  const DEMOGRAPHIC = new Set(['age_years', 'sex', 'pregnant', 'gestational_weeks', 'symptom_onset']);
  if (text.trim().length > 3 && !hits.some((h) => !DEMOGRAPHIC.has(h.key) && h.value === true))
    hits.push({ key: 'unrecognized_complaint', value: true, confidence: 0.7, quote: text.slice(0, 60), note: 'No finding in CareGraph\'s knowledge — will not guess' });

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
