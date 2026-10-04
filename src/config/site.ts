/**
 * Site-wide placeholders. Fill these in (or let Lovable edit this file).
 * Empty strings render as labelled dashed placeholder boxes — never broken links.
 */
export const SITE = {
  name: 'CareGraph',
  tagline: 'An ASHA calls from any phone. CareGraph asks only what matters and gets her patient to care that can treat her.',
  /** Number judges can call. With a Twilio trial, use WhatsApp "CALL" for a callback instead. */
  phoneNumber: '', // {{PHONE_NUMBER}} e.g. '+1 737 258 3742'
  whatsappNumber: '+1 415 523 8886', // Twilio WhatsApp sandbox
  whatsappJoinCode: '', // {{WHATSAPP_JOIN_CODE}} e.g. 'join bright-river'
  /** YouTube/Loom *embed* URL for the 2-minute demo video. */
  demoVideoUrl: '', // {{DEMO_VIDEO_URL}}
  /** Live telephony server (tunnel or host). Also settable per browser with ?tel=… */
  telephonyUrl: 'https://caregraph-9b06.onrender.com',
  githubUrl: 'https://github.com/dpaul0501/caregraph',
  team: [] as { name: string; role: string }[], // {{TEAM}} e.g. [{ name: 'D. Paul', role: 'AI & engineering' }]
};
