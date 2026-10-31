// The restricted-word check as the panel uses it, for the site of the open tab.

import { useMemo } from 'react';
import type { PlatformId } from '@/lib/platforms';
import { type Match, wordMatcher } from '@/lib/restricted';
import type { Settings } from '@/lib/store';
import { AVOID_SUBJECTS, rulesFor } from '@/lib/wordLists';

export interface WordCheck {
  find: (text: string) => Match[];
  avoidWords: string[]; // what AI is told by name: the creator's own words
  avoidTopics: string[]; // and by subject: what the built-in list is about
}

const NONE: WordCheck = { find: () => [], avoidWords: [], avoidTopics: [] };

export function useWordCheck(settings: Settings | null, platform: PlatformId): WordCheck {
  return useMemo(() => {
    if (!settings) return NONE;
    return {
      find: wordMatcher(rulesFor(settings, platform)),
      avoidWords: settings.customWords,
      avoidTopics: AVOID_SUBJECTS,
    };
  }, [settings, platform]);
}

export const marksOf = (matches: Match[]) => matches.map((m) => ({ ...m, className: 'restricted' }));
