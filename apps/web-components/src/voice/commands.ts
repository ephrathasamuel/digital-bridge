import { foldFidel } from './spokenInput';

/**
 * Spoken commands for hands-free use (learners who cannot see the screen or cannot type / use a pointer).
 * Amharic and English words are both accepted whatever the UI language, because Amharic speech recognition is
 * often unavailable and the engine may fall back to English.
 */
export type VoiceCommand =
  | 'next' | 'back' | 'repeat' | 'down' | 'up' | 'choose' | 'answer' | 'help' | 'commands' | 'stop' | 'english' | 'amharic'
  | 'scrollDown' | 'scrollUp' | 'guide' | 'retry' | 'skip' | 'career' | 'onboarding';

const PHRASES: Record<VoiceCommand, string[]> = {
  next: ['next', 'continue', 'forward', 'go forward', 'save', 'ቀጥል', 'ቀጥይ', 'ቀጣይ', 'ወደፊት', 'ወደ ፊት'],
  back: ['back', 'go back', 'previous', 'previous question', 'ተመለስ', 'ተመለሺ', 'ወደኋላ', 'ወደ ኋላ'],
  repeat: ['repeat', 'again', 'read', 'read aloud', 'say again', 'read again', 'ድገም', 'ደግም', 'አንብብ', 'እንደገና'],
  down: ['down', 'next item', 'next field', 'tab', 'ታች', 'ቀጣይ ንጥል'],
  up: ['up', 'previous item', 'previous field', 'ላይ', 'ቀዳሚ ንጥል'],
  // Round-2 finding: "scroll down/up" moves the page itself.
  scrollDown: ['scroll down', 'page down', 'scroll', 'ወደ ታች', 'ወደታች', 'ገጹን ወደ ታች'],
  scrollUp: ['scroll up', 'page up', 'ወደ ላይ', 'ወደላይ', 'ገጹን ወደ ላይ'],
  choose: ['choose', 'select', 'ok', 'okay', 'press', 'click', 'tick', 'enter', 'yes', 'keep', 'ምረጥ', 'ምረጪ', 'እሺ', 'አዎ', 'ተጫን', 'አቆይ'],
  // Guided fill: walks through the text fields of the step one by one.
  guide: ['guide', 'guide me', 'fill', 'fill step by step', 'guided fill', 'ምራኝ', 'ተራ በተራ ሙላ'],
  retry: ['no', 'try again', 'retry', 'አይ', 'አይደለም', 'እንደገና ሞክር'],
  skip: ['skip', 'ዝለል'],
  career: ['career', 'jobs', 'job', 'career gateway', 'find jobs', 'ስራ', 'ሥራ', 'ስራዎች', 'ሥራዎች'],
  onboarding: ['onboarding', 'sign up', 'signup', 'registration', 'ምዝገባ'],
  answer: ['answer', 'dictate', 'speak', 'መልስ', 'ተናገር'],
  // "help" opens the widget's Need help dialog (co-designer finding); "commands" reads the command list.
  help: ['help', 'need help', 'help me', 'እርዳታ', 'እገዛ', 'እርዱኝ'],
  commands: ['commands', 'what can i say', 'list commands', 'ትዕዛዝ', 'ትዕዛዞች'],
  stop: ['stop', 'stop listening', 'voice off', 'exit', 'አቁም', 'አቁሚ', 'ዝም'],
  english: ['english', 'እንግሊዝኛ'],
  amharic: ['amharic', 'አማርኛ'],
};

/** Every phrase as a token list, longest first, so "next item" wins over "next" and "go back" over "back". */
const MATCHERS = (Object.entries(PHRASES) as [VoiceCommand, string[]][])
  .flatMap(([command, phrases]) => phrases.map((phrase) => ({ command, tokens: phrase.split(' ') })))
  .sort((a, b) => b.tokens.length - a.tokens.length);

const tokenise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,!?¿¡።፣፤፥፦'"«»]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** The command in a transcript (whole words only), or null. Uses the LAST command said in a run-on transcript. */
export function matchCommand(transcript: string): VoiceCommand | null {
  const words = tokenise(transcript);
  for (let end = words.length; end > 0; end--) {
    for (const { command, tokens } of MATCHERS) {
      const start = end - tokens.length;
      if (start >= 0 && tokens.every((token, i) => words[start + i] === token)) return command;
    }
  }
  return null;
}

/** Words that confirm or cancel a "Did you mean …?" question. */
const YES = new Set(['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'correct', 'right', 'እሺ', 'አዎ', 'አዎን', 'ትክክል']);
const NO = new Set(['no', 'nope', 'cancel', 'wrong', 'አይ', 'አይደለም', 'ተው']);

export function isYes(transcript: string): boolean {
  const words = tokenise(transcript);
  return words.length > 0 && words.length <= 3 && words.some((w) => YES.has(w));
}

export function isNo(transcript: string): boolean {
  const words = tokenise(transcript);
  return words.length > 0 && words.length <= 3 && words.some((w) => NO.has(w));
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** How many letter mistakes a spoken word may have and still count as close: none for short words like "no". */
const allowance = (word: string) => {
  const length = Array.from(word).length;
  if (/[ሀ-፿]/.test(word)) return length >= 3 ? 1 : 0; // one Fidel letter is a whole syllable
  return length >= 7 ? 2 : length >= 4 ? 1 : 0;
};

export interface CommandGuess {
  command: VoiceCommand;
  /** true: the words matched exactly, act at once. false: close but not sure, ask "Did you mean …?" first. */
  exact: boolean;
  /** The command phrase that was matched, to say back to the learner. */
  phrase: string;
}

/**
 * Exact match first (fast path). Otherwise a short utterance that is one or two letters away from exactly one command
 * phrase ("nest" -> next, "ቀጥሉ" -> ቀጥል) is a guess that should be confirmed. Ambiguous or long utterances give null.
 */
export function guessCommand(transcript: string): CommandGuess | null {
  const exact = matchCommand(transcript);
  if (exact) return { command: exact, exact: true, phrase: PHRASES[exact][0] };
  const words = tokenise(transcript).map((w) => foldFidel(w));
  if (!words.length || words.length > 4) return null;
  let best: { command: VoiceCommand; phrase: string; cost: number } | null = null;
  let tie = false;
  for (const { command, tokens } of MATCHERS) {
    if (tokens.length !== words.length) continue;
    let cost = 0;
    let fits = true;
    tokens.forEach((token, i) => {
      const d = editDistance(foldFidel(token), words[i]);
      if (d > allowance(token)) fits = false;
      cost += d;
    });
    if (!fits || cost === 0) continue;
    if (!best || cost < best.cost) {
      best = { command, phrase: tokens.join(' '), cost };
      tie = false;
    } else if (cost === best.cost && command !== best.command) {
      tie = true;
    }
  }
  return best && !tie ? { command: best.command, exact: false, phrase: best.phrase } : null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  // Amharic (with spellings speech engines produce)
  'አንድ': 1, 'ሁለት': 2, 'ሶስት': 3, 'ሦስት': 3, 'አራት': 4, 'አምስት': 5, 'ስድስት': 6, 'ሰባት': 7, 'ስምንት': 8, 'ዘጠኝ': 9,
  'አስር': 10, 'አሥር': 10,
};
/** Words people put before the number ("number 3", "item 3", "ቁጥር 3"). */
const NUMBER_PREFIX = new Set(['number', 'item', 'option', 'no', 'ቁጥር', 'ንጥል', 'ምርጫ']);

/**
 * "3", "three", "number three", "ሶስት", "ቁጥር ፫" -> 3. Only when the whole utterance is a number (optionally with a
 * prefix), so a number inside a sentence is never mistaken for a command.
 */
export function matchNumber(transcript: string): number | null {
  const words = tokenise(transcript.replace(/[፩-፱]/g, (ch) => String(ch.charCodeAt(0) - 0x1368)));
  const rest = words.length > 1 && NUMBER_PREFIX.has(words[0]) ? words.slice(1) : words;
  if (rest.length !== 1) return null;
  const word = rest[0];
  if (/^\d{1,2}$/.test(word)) return Number(word) || null;
  return NUMBER_WORDS[word] ?? null;
}
