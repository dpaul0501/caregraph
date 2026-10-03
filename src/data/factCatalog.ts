import type { FactDef } from '../engine/types';

export const FACTS: Record<string, FactDef> = {
  age_years: { label: 'Age', type: 'number', unit: 'y', group: 'demographic' },
  sex: { label: 'Sex', type: 'text', group: 'demographic' },
  pregnant: { label: 'Pregnant', type: 'boolean', group: 'demographic' },
  gestational_weeks: { label: 'Gestational age', type: 'number', unit: 'wk', group: 'demographic' },

  // Maternal presentation
  severe_headache: { label: 'Severe headache', type: 'boolean', group: 'presentation' },
  headache: { label: 'Headache', type: 'boolean', group: 'presentation' },
  symptom_onset: { label: 'Onset', type: 'text', group: 'presentation' },
  edema: { label: 'Swelling / oedema', type: 'boolean', group: 'presentation' },
  dizziness: { label: 'Dizziness', type: 'boolean', group: 'presentation' },
  visual_disturbance: { label: 'Visual disturbance', type: 'boolean', group: 'presentation' },
  convulsions: { label: 'Convulsions', type: 'boolean', group: 'presentation' },
  vaginal_bleeding: { label: 'Vaginal bleeding', type: 'boolean', group: 'presentation' },
  epigastric_pain: { label: 'Epigastric pain', type: 'boolean', group: 'presentation' },
  sbp: { label: 'Systolic BP (now)', type: 'number', unit: 'mmHg', group: 'measurement' },
  dbp: { label: 'Diastolic BP (now)', type: 'number', unit: 'mmHg', group: 'measurement' },

  // Pediatric presentation
  recurrent_fracture: { label: 'Recurrent fractures', type: 'boolean', group: 'presentation' },
  fracture_count: { label: 'Fractures reported (this year)', type: 'number', group: 'presentation' },
  low_trauma: { label: 'Low-trauma mechanism', type: 'boolean', group: 'presentation' },
  short_stature: { label: 'Short stature', type: 'boolean', group: 'presentation' },
  blue_sclera: { label: 'Blue / grey sclera', type: 'boolean', group: 'presentation' },
  family_history_fractures: { label: 'Family history of fractures', type: 'boolean', group: 'presentation' },
  hearing_impairment: { label: 'Hearing problems', type: 'boolean', group: 'presentation' },
  acute_deformity: { label: 'Acute deformity / open wound now', type: 'boolean', group: 'presentation' },

  // Fever
  fever: { label: 'Fever', type: 'boolean', group: 'presentation' },
  myalgia: { label: 'Body aches', type: 'boolean', group: 'presentation' },

  // History (from record)
  hx_gestational_htn: { label: 'Gestational hypertension (dx)', type: 'boolean', group: 'history' },
  hx_last_bp: { label: 'Last recorded BP', type: 'text', group: 'history' },
  hx_last_sbp: { label: 'Last recorded systolic', type: 'number', unit: 'mmHg', group: 'history' },
  hx_missed_anc: { label: 'Missed ANC visit', type: 'boolean', group: 'history' },
  hx_referral_incomplete: { label: 'Previous referral not completed', type: 'boolean', group: 'history' },
  hx_medication: { label: 'Medication on record', type: 'text', group: 'history' },
  hx_allergies: { label: 'Allergies', type: 'text', group: 'history' },
  hx_gravida_para: { label: 'Obstetric history', type: 'text', group: 'history' },
  hx_prior_fractures: { label: 'Prior fractures on record', type: 'text', group: 'history' },
};

export const factLabel = (k: string) => FACTS[k]?.label ?? k;
