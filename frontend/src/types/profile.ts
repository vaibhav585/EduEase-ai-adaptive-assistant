// Shapes frozen in DATA_CONTRACT.md v1 (master). Do not change field names unilaterally.

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
  describeImages: boolean;
}

export interface Profile {
  disabilities: Disability[];
  primary: Disability | null;
  severity: Severity | null;
  prefs: Prefs;
}

export const DEFAULT_PREFS: Prefs = {
  fontScale: 1,
  highContrast: false,
  dyslexiaFont: false,
  reduceMotion: false,
  ttsEnabled: false,
  ttsRate: 1,
  voiceNav: false,
  captionsAlways: false,
  webcamAttention: false,
  describeImages: false,
};

export const DEFAULT_PROFILE: Profile = {
  disabilities: [],
  primary: null,
  severity: null,
  prefs: DEFAULT_PREFS,
};

/** Which DASE/simplify/quiz disability profile to score & write content against. */
export function scoringProfile(profile: Profile): string {
  return profile.primary ?? profile.disabilities[0] ?? 'default';
}

/** Webcam must be off for blind/low-vision users regardless of what's stored. */
export function webcamAllowed(profile: Profile): boolean {
  if (profile.disabilities.some((d) => d === 'blind' || d === 'low_vision')) return false;
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
