// What a message is checked against on each site: the built-in list and the creator's own
// words, minus the words they allow, everywhere or on one site.

import { BUILT_IN } from './baseWords';
import type { PlatformId } from './platforms';
import type { WordRules } from './restricted';

export { BUILT_IN };

export interface WordSettings {
  customWords: string[];
  allowedWords: string[]; // allowed on every site
  allowedOn: Partial<Record<PlatformId, string[]>>; // allowed on one site only
}

// What AI is told to stay off, in a few words: what the built-in list is about. Shorter than
// the list itself, and it covers words the list doesn't have.
export const AVOID_SUBJECTS = [
  'payments or contact off the site',
  'meeting in person or escorting',
  'anyone underage',
  'drugs',
  'self-harm or choking',
  'banned kinks',
  'file-sharing links',
  'public exposure',
];

export const allowedFor = (settings: WordSettings, platform: PlatformId) =>
  unique([...settings.allowedWords, ...(settings.allowedOn[platform] ?? [])]);

export function rulesFor(settings: WordSettings, platform: PlatformId): WordRules {
  return { block: unique([...settings.customWords, ...BUILT_IN]), allow: allowedFor(settings, platform) };
}

function unique(words: string[]): string[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
