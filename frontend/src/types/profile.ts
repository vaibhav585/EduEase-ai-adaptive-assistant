// Shapes frozen in DATA_CONTRACT.md v1. Do not change field names unilaterally —
// Tracks A/B/C all read against these.

export type Disability =
  | 'dyslexia'
  | 'adhd'
  | 'autism'
  | 'blind'
  | 'low_vision'
  | 'deaf'
  | 'hard_of_hearing'
  | 'dyscalculia'
  | 'dysgraphia'
  | 'anxiety'
  | 'intellectual'
  | 'motor';

export const DISABILITY_LABELS: Record<Disability, string> = {
  dyslexia: 'Dyslexia (reading)',
  adhd: 'ADHD (attention)',
  autism: 'Autism',
  blind: 'Blind',
  low_vision: 'Low vision',
  deaf: 'Deaf',
  hard_of_hearing: 'Hard of hearing',
  dyscalculia: 'Dyscalculia (maths)',
  dysgraphia: 'Dysgraphia (writing)',
  anxiety: 'Anxiety',
  intellectual: 'Intellectual disability',
  motor: 'Motor / mobility',
};

export type Severity = 'mild' | 'moderate' | 'significant';

export interface Prefs {
  fontScale: number;
  highContrast: boolean;
  dyslexiaFont: boolean;
  reduceMotion: boolean;
  ttsEnabled: boolean;
  ttsRate: number;
  voiceNav: boolean;
  captionsAlways: boolean;
  webcamAttention: boolean;
  /** Phase 3 built the backend (image_describer.py) but nothing ever set this
   * from the frontend — UploadForm never sent it and no toggle existed to turn
   * it on. Additive field, DATA_CONTRACT.md v1 §"Additive changes ... fine
   * without ceremony"; useProfile.ts already merges against DEFAULT_PREFS so
   * existing accounts get the default rather than a missing-field crash. */
  describeImages: boolean;
}

export interface Profile {
  disabilities: Disability[];
  primary: Disability | null;
  severity: Severity | null;
  prefs: Prefs;
}

export interface Consent {
  dataCollection: boolean;
  webcam: boolean;
  disabilityDisclosure: boolean;
  version: number;
}

export const CONSENT_VERSION = 1;

export const DEFAULT_PREFS: Prefs = {
  fontScale: 1,
  highContrast: false,
  dyslexiaFont: false,
  reduceMotion: false,
  ttsEnabled: false,
  ttsRate: 1,
  voiceNav: false,
  captionsAlways: false,
  webcamAttention: false, // opt-in, never on by default
  describeImages: false, // opt-in; AuthForm defaults it true for blind/low_vision at signup
};

export const DEFAULT_PROFILE: Profile = {
  disabilities: [],
  primary: null,
  severity: null,
  prefs: DEFAULT_PREFS,
};

/** Which DASE weight profile to score this student against (DATA_CONTRACT §2). */
export function scoringProfile(profile: Profile): string {
  return profile.primary ?? profile.disabilities[0] ?? 'default';
}

/** Webcam must be off for blind/low-vision users regardless of what's stored. */
export function webcamAllowed(profile: Profile, consent?: Consent | null): boolean {
  if (profile.disabilities.some((d) => d === 'blind' || d === 'low_vision')) return false;
  if (consent && !consent.webcam) return false;
  return profile.prefs.webcamAttention;
}

/** Applies visual prefs to the document root. Cheap, idempotent, no dependency. */
export function applyPrefs(prefs: Prefs): void {
  const root = document.documentElement;
  root.style.setProperty('--font-scale', String(prefs.fontScale));
  root.classList.toggle('high-contrast', prefs.highContrast);
  root.classList.toggle('dyslexia-font', prefs.dyslexiaFont);
  root.classList.toggle('reduce-motion', prefs.reduceMotion);
}
