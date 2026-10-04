import maternal from '../protocols/maternal_demo_v1.json';
import pediatric from '../protocols/pediatric_bone_demo_v1.json';
import type { Protocol } from '../engine/types';

export type CouncilChoice = 'AGREE + REFER' | 'ASK ANOTHER QUESTION' | 'MANAGE LOCALLY' | 'CALL ME';

export type DemoAnswer = { bp: string } | { outcome: number } | { unknown: true };

export interface ScenarioDef {
  id: 'maternal' | 'pediatric';
  label: string;
  tagline: string;
  patientId: string;
  workerId: string;
  protocol: Protocol;
  /** Scripted intake for demo fallback (pre-transcribed). */
  intake: Record<string, string>;
  demoAnswers: Record<string, DemoAnswer>;
  diagnosisNote: string;
  /** Facts shown as positives in the clinician packet. */
  presentKeys: string[];
  /** Facts that must be stated explicitly when still unknown. */
  unknownKeys: string[];
  facilityResponse: { by: string; role: string; text: string; nonUrgentSlot?: string };
  counterReferral: string;
  /** Scripted council responses (simulated clinicians), keyed by expert id. */
  council?: Record<string, { choice: CouncilChoice; text: string; suggestsQuestion?: string }>;
}

export const SCENARIOS: Record<ScenarioDef['id'], ScenarioDef> = {
  maternal: {
    id: 'maternal',
    label: 'A · Maternal emergency',
    tagline: 'Protocol authority → capable facility → transport → handoff',
    patientId: 'PT-0417',
    workerId: 'asha-asha',
    protocol: maternal as Protocol,
    intake: {
      en: 'Thirty-one-year-old woman, 34 weeks pregnant, severe headache since morning and swelling.',
      hi: '31 साल की महिला, 34 हफ़्ते की गर्भवती, सुबह से तेज़ सिरदर्द और सूजन।',
    },
    demoAnswers: { q_bp: { bp: '166/108' } },
    diagnosisNote: 'Not established — not required to choose the safe next action',
    presentKeys: ['severe_headache', 'symptom_onset', 'edema', 'dizziness', 'visual_disturbance', 'convulsions', 'vaginal_bleeding'],
    unknownKeys: ['visual_disturbance', 'convulsions', 'vaginal_bleeding', 'epigastric_pain'],
    facilityResponse: {
      by: 'Dr. S. Rao',
      role: 'Duty obstetrician, District Hospital Barhi',
      text: 'ACCEPT. Labour ward informed, bed reserved. Send on arrival to labour room.',
    },
    counterReferral:
      'Counter-referral (DH Barhi): admitted to obstetric unit under Dr. S. Rao. Discharge summary and follow-up plan will be sent to PHC Kheri and ASHA Asha K.',
  },
  pediatric: {
    id: 'pediatric',
    label: 'B · Ambiguous child case',
    tagline: 'Iterative questions → diminishing value → right human expert',
    patientId: 'PT-0882',
    workerId: 'asha-rekha',
    protocol: pediatric as Protocol,
    intake: {
      en: 'Eight-year-old boy. This is his third fracture this year. The bones seem to break easily. He is also short for his age.',
    },
    demoAnswers: { q_trauma: { outcome: 0 }, q_sclera: { outcome: 0 }, q_family: { unknown: true }, q_hearing: { outcome: 0 } },
    diagnosisNote: 'Not established — CareGraph does not rank diagnoses; pathway requires specialist evaluation',
    presentKeys: ['fracture_count', 'low_trauma', 'short_stature', 'blue_sclera', 'family_history_fractures', 'hearing_impairment'],
    unknownKeys: ['family_history_fractures', 'hearing_impairment', 'acute_deformity'],
    council: {
      'dr-iyer': {
        choice: 'AGREE + REFER',
        text: 'Ask about hearing problems; specialist referral appropriate.',
        suggestsQuestion: 'q_hearing',
      },
      'dr-khan': {
        choice: 'AGREE + REFER',
        text: 'No acute orthopaedic issue reported. Agree with bone clinic referral; bring prior X-rays.',
      },
    },
    facilityResponse: {
      by: 'Genetics clinic desk',
      role: 'Govt. Medical College Hospital',
      text: 'ACCEPT. Booked: pediatric genetics / bone clinic, Friday 10:00.',
      nonUrgentSlot: 'Friday 10:00',
    },
    counterReferral:
      'Counter-referral (Medical College genetics clinic): child seen; specialist plan to be shared with PHC Dhanpur and ASHA Rekha S.',
  },
};
