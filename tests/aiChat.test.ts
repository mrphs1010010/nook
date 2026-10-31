import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { KEEP_TURNS, addTurn, clearTurns, getTurns } from '@/lib/aiChat';
import { exportBackup } from '@/lib/store';

const turn = (n: number) => ({ ask: `ask ${n}`, answer: `answer ${n}`, model: 'Grok 4.7', at: n });

beforeEach(() => fakeBrowser.reset());

describe('chat with AI', () => {
  it('keeps the last turns of each fan apart', async () => {
    await Promise.all(Array.from({ length: KEEP_TURNS + 2 }, (_, i) => addTurn('onlyfans:1', turn(i))));
    await addTurn('onlyfans:2', turn(99));

    const turns = await getTurns('onlyfans:1');
    expect(turns.map((t) => t.at)).toEqual(Array.from({ length: KEEP_TURNS }, (_, i) => i + 2));
    expect(await getTurns('onlyfans:2')).toEqual([turn(99)]);
  });

  it('forgets a fan’s turns, and keeps them out of backups', async () => {
    await addTurn('onlyfans:1', turn(1));
    expect(JSON.stringify(await exportBackup())).not.toContain('ask 1');
    await clearTurns('onlyfans:1');
    expect(await getTurns('onlyfans:1')).toEqual([]);
  });
});
