/**
 * Client-side voice command matching.
 *
 * DELIBERATE DUPLICATION of backend/services/intent.py. Justification: a blind
 * student saying "stop" while the page is talking must be obeyed instantly, and a
 * network round-trip per utterance is the wrong latency for the primary — often
 * only — input method. The backend copy still exists for the LLM fallback and for
 * any client that cannot match locally.
 *
 * The duplication is guarded: backend/test_phase3.py parses BOTH files and fails
 * if the intent sets drift apart.
 */

export const ROUTES: Record<string, string> = {
  dashboard: '/student-dashboard',
  quiz: '/quiz',
  learning: '/learning',
  upload: '/upload',
  content: '/content',
  teacher: '/teacher-dashboard',
};

export interface IntentMatch {
  intent: string;
  slots: Record<string, unknown>;
  source: 'rules' | 'llm';
  confidence: number;
}

const OPTION_WORDS: Record<string, number> = {
  a: 0, first: 0, one: 0, '1': 0,
  b: 1, second: 1, two: 1, '2': 1,
  c: 2, third: 2, three: 2, '3': 2,
  d: 3, fourth: 3, four: 3, '4': 3,
};

const NAV_TARGETS: Record<string, string> = {
  dashboard: 'dashboard', home: 'dashboard',
  quiz: 'quiz', quizzes: 'quiz', test: 'quiz',
  lesson: 'learning', lessons: 'learning', learning: 'learning',
  read: 'learning', reading: 'learning',
  upload: 'upload',
  content: 'content', material: 'content', materials: 'content',
  teacher: 'teacher',
};

// Order matters. STOP is first: a student silencing the page must never have that
// parsed as something else.
const RULES: Array<[string, RegExp]> = [
  ['STOP', /\b(stop|quiet|silence|shut up|be quiet|pause|cancel|nevermind|never mind)\b/],
  ['HELP', /\b(help|what can (i|you) (say|do)|commands|options available)\b/],
  ['PROGRESS', /\b(my )?(progress|score|how (am i|i am) doing|how did i do|results?|marks)\b/],
  ['DESCRIBE_PAGE', /\b(what('s| is) (on |in )?(this |the )?(page|screen)|where am i|describe( the)?( page| screen)?|what can i do here)\b/],
  ['EXPLAIN', /\b(explain|what does (this|that) mean|i don'?t understand|simpler|say (that )?(again )?(in )?(simpler|easier)|break (it|this) down)\b/],
  ['READ_NEXT', /\b(read (the )?next|next (paragraph|sentence|part|section|bit)|continue|carry on|go on|keep reading)\b/],
  ['READ_PREVIOUS', /\b(read (the )?(previous|last)|previous (paragraph|sentence|part|section)|go back|back up)\b/],
  ['REPEAT', /\b(repeat|say (that|it) again|again|once more|pardon|what)\b/],
  ['READ_ALL', /\b(read (it |this |the )?(all|everything|whole|page|aloud)|start reading|read to me)\b/],
  ['FASTER', /\b(faster|speed up|quicker|too slow)\b/],
  ['SLOWER', /\b(slower|slow down|too fast)\b/],
  ['SUBMIT', /\b(submit|confirm|next question|done|that'?s my answer|lock it in)\b/],
];

const NAV_RE =
  /\b(go|navigate|take me|open|show me|switch)\b.*?\b(dashboard|home|quiz|quizzes|test|lesson|lessons|learning|read|reading|upload|content|material|materials|teacher)\b/;

const ANSWER_RE =
  /\b(?:answer|choose|select|pick|option|number)\b\s*(?:is\s+|the\s+)?(?:option\s+|number\s+)?\b([abcd]|first|second|third|fourth|one|two|three|four|[1-4])\b/;

const BARE_OPTION_RE = /^\s*(?:option\s+)?([abcd]|[1-4]|first|second|third|fourth)\s*$/;

function normalise(text: string): string {
  return (text ?? '').toLowerCase().replace(/[^\w\s']/g, ' ').trim();
}

/** Returns null when nothing matched, so the caller can decide about the LLM. */
export function matchIntent(text: string): IntentMatch | null {
  const cleaned = normalise(text);
  if (!cleaned) return null;

  // Answering beats navigation: "take option two" contains "take".
  const answer = ANSWER_RE.exec(cleaned) ?? BARE_OPTION_RE.exec(cleaned);
  if (answer) {
    const idx = OPTION_WORDS[answer[1]];
    if (idx !== undefined) {
      return { intent: 'ANSWER', slots: { optionIndex: idx }, source: 'rules', confidence: 0.95 };
    }
  }

  const nav = NAV_RE.exec(cleaned);
  if (nav) {
    const target = NAV_TARGETS[nav[2]];
    if (target) {
      return {
        intent: 'NAVIGATE',
        slots: { target, path: ROUTES[target] },
        source: 'rules',
        confidence: 0.95,
      };
    }
  }

  for (const [name, pattern] of RULES) {
    if (pattern.test(cleaned)) {
      return { intent: name, slots: {}, source: 'rules', confidence: 0.9 };
    }
  }

  const bare = NAV_TARGETS[cleaned];
  if (bare) {
    return {
      intent: 'NAVIGATE',
      slots: { target: bare, path: ROUTES[bare] },
      source: 'rules',
      confidence: 0.8,
    };
  }

  return null;
}

/**
 * Spoken page descriptions.
 *
 * `short` plays automatically on arrival and must stay brief — a long
 * announcement on every navigation is actively hostile. `long` answers an
 * explicit "what is on this page".
 */
export const PAGE_SUMMARIES: Record<string, { short: string; long: string }> = {
  '/student-dashboard': {
    short: 'Student dashboard.',
    long:
      'This is your dashboard. There are three things here: upload a PDF, manage your content, ' +
      'and start learning. There is also a chat button. Say go to my lessons, or go to my quizzes.',
  },
  '/learning': {
    short: 'Lesson page.',
    long:
      'This is the lesson page. The lesson text has been simplified for you. ' +
      'Say read everything to hear it, read next for the next part, or explain this if something ' +
      'is unclear. When you are ready, say go to my quizzes.',
  },
  '/quiz': {
    short: 'Quiz page.',
    long:
      'This is the quiz. Each question has four options, A, B, C and D. ' +
      'Say repeat to hear the question again, then say answer A, B, C or D, then say submit.',
  },
  '/upload': {
    short: 'Upload page.',
    long: 'This is the upload page. Choose a PDF file to turn into a lesson.',
  },
  '/content': {
    short: 'Your content.',
    long: 'This page lists your saved learning material.',
  },
  '/teacher-dashboard': {
    short: 'Teacher dashboard.',
    long: 'This is the teacher dashboard, showing student progress and learning profiles.',
  },
};

export function describeCurrentPage(pathname: string): string {
  return (
    PAGE_SUMMARIES[pathname]?.long ??
    'I do not have a description for this page. Say help to hear what you can ask for.'
  );
}
