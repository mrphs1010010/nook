// The creator's chat with the AI about each fan: the last few turns, kept on this computer
// under "ai-chat:<fan key>" and left out of backups.

import { browser } from 'wxt/browser';
import type { AiTurn } from './ai';

export const KEEP_TURNS = 10; // older turns drop off, so the context sent stays small

const PREFIX = 'ai-chat:';

export async function getTurns(fanKey: string): Promise<AiTurn[]> {
  const stored = (await browser.storage.local.get(PREFIX + fanKey))[PREFIX + fanKey];
  return Array.isArray(stored) ? (stored as AiTurn[]) : [];
}

// Turns of one fan are added one after another, so two answers never overwrite each other.
let writes: Promise<unknown> = Promise.resolve();

export function addTurn(fanKey: string, turn: AiTurn): Promise<void> {
  const run = writes.then(async () => {
    const turns = [...(await getTurns(fanKey)), turn].slice(-KEEP_TURNS);
    await browser.storage.local.set({ [PREFIX + fanKey]: turns });
  });
  writes = run.catch(() => {});
  return run;
}

export function clearTurns(fanKey: string): Promise<void> {
  return browser.storage.local.remove(PREFIX + fanKey);
}

// Calls back with the fan's turns whenever they change. Returns an unsubscribe function.
export function onTurnsChanged(fanKey: string, callback: (turns: AiTurn[]) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && PREFIX + fanKey in changes) getTurns(fanKey).then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
