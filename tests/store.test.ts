import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { parseChat } from '@/lib/platforms';
import {
  type Fan,
  exportBackup,
  getFan,
  getSettings,
  importBackup,
  listFans,
  mergeFans,
  newFan,
  normalizeFan,
  normalizeSettings,
  updateFan,
  updateSettings,
} from '@/lib/store';

const chat = parseChat('https://onlyfans.com/my/chats/chat/1/')!;
const fan = (overrides: Partial<Fan>): Fan => ({ ...newFan(chat), ...overrides });

beforeEach(() => {
  fakeBrowser.reset();
});

describe('updateFan', () => {
  it('creates the record on the first edit', async () => {
    await updateFan(chat, (f) => {
      f.tags.push('vip');
    });
    expect(await getFan(chat.key)).toMatchObject({ key: 'onlyfans:1', tags: ['vip'] });
  });

  it('does not create a record when told not to', async () => {
    await updateFan(
      chat,
      (f) => {
        f.name = 'Jess';
      },
      { create: false },
    );
    expect(await getFan(chat.key)).toBeNull();
  });

  it('applies concurrent edits one after another, losing none', async () => {
    await Promise.all(
      ['a', 'b', 'c'].map((id) =>
        updateFan(chat, (f) => {
          f.notes.push({ id, text: id, createdAt: 0 });
        }),
      ),
    );
    expect((await getFan(chat.key))?.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips saving when the mutation returns false', async () => {
    await updateFan(chat, () => false);
    expect(await listFans()).toEqual([]);
  });
});

describe('importBackup', () => {
  it('merges into what is stored and rejects other files', async () => {
    await updateFan(chat, (f) => {
      f.notes.push({ id: 'local', text: 'local', createdAt: 1 });
    });
    const count = await importBackup({
      app: 'nook',
      version: 1,
      fans: [
        { platform: 'onlyfans', chatId: '1', notes: [{ id: 'backup', text: 'backup', createdAt: 2 }] },
        { platform: 'fansly', chatId: '2', alias: 'New' },
        { platform: 'twitter', chatId: '3' },
      ],
    });
    expect(count).toBe(2);
    expect((await getFan('onlyfans:1'))?.notes.map((n) => n.id)).toEqual(['backup', 'local']);
    expect((await getFan('fansly:2'))?.alias).toBe('New');
    await expect(importBackup({ hello: 'world' })).rejects.toThrow('Not a Nook backup file');
  });
});

describe('settings', () => {
  const template = (id: string, text = id) => ({ id, text, tags: [], favorite: false, uses: 0, createdAt: 1 });
  const defaults = {
    customWords: [],
    allowedWords: [],
    allowedOn: {},
    holdBack: true,
    templates: [],
    insertIntoChat: true,
    theme: 'system',
    autoSpending: true,
    aiSeesChat: true,
    aiSeesCard: true,
    aiRemembers: true,
    voice: '',
  };

  it('starts with no words of its own, no templates and everything on', async () => {
    expect(await getSettings()).toEqual(defaults);
  });

  it('saves edits', async () => {
    await updateSettings((s) => {
      s.customWords = ['venmo'];
      s.templates.push(template('t1', 'Hey {name}'));
      s.theme = 'dark';
    });
    expect(await getSettings()).toEqual({
      ...defaults,
      customWords: ['venmo'],
      templates: [template('t1', 'Hey {name}')],
      theme: 'dark',
    });
  });

  it('travels in backups', async () => {
    await updateSettings((s) => {
      s.customWords = ['venmo'];
      s.allowedWords = ['@me'];
      s.allowedOn = { fansly: ['hr'] };
    });
    const backup = await exportBackup();
    expect(backup.settings).toMatchObject({ customWords: ['venmo'], allowedWords: ['@me'], allowedOn: { fansly: ['hr'] } });

    fakeBrowser.reset();
    await importBackup(backup);
    expect(await getSettings()).toMatchObject({ customWords: ['venmo'], allowedWords: ['@me'], allowedOn: { fansly: ['hr'] } });
  });

  it('merges imported settings into edited ones', async () => {
    await updateSettings((s) => {
      s.customWords = ['venmo', 'zelle'];
      s.templates = [template('t1', 'mine')];
    });
    await importBackup({
      app: 'nook',
      version: 1,
      fans: [],
      settings: { customWords: ['Zelle', 'kik'], allowedWords: ['@me'], allowedOn: { fansly: ['hr'] }, templates: [template('t1', 'theirs'), template('t2')] },
    });
    expect(await getSettings()).toMatchObject({
      customWords: ['venmo', 'zelle', 'kik'],
      allowedWords: ['@me'],
      allowedOn: { fansly: ['hr'] },
      templates: [template('t1', 'mine'), template('t2')],
    });
  });

  it('keeps the creator’s choices about what Nook does on its own', () => {
    expect(normalizeSettings({ autoSpending: false, aiSeesChat: false, voice: 'lowercase' })).toMatchObject({
      autoSpending: false,
      aiSeesChat: false,
      aiSeesCard: true,
      voice: 'lowercase',
    });
  });

  it('takes the words of settings saved before the built-in lists', () => {
    expect(normalizeSettings({ restrictedWords: ['kik', 'pink panda'] })?.customWords).toEqual(['kik', 'pink panda']);
    // The placeholders the first version started with are covered by the built-in lists now.
    expect(normalizeSettings({ restrictedWords: ['paypal', 'cashapp', 'venmo', 'zelle', 'telegram', 'whatsapp', 'snapchat', 'meet up'] })?.customWords).toEqual([]);
    expect(normalizeSettings({ allowedOn: { onlyfans: ['hr', 'HR', 3], myspace: ['hr'] } })?.allowedOn).toEqual({ onlyfans: ['hr'] });
  });

  it('cleans up settings from a file', () => {
    expect(normalizeSettings(null)).toBeNull();
    expect(
      normalizeSettings({
        restrictedWords: [' kik ', '', 3, 'KIK'],
        holdBack: 'yes',
        theme: 'neon',
        templates: [
          { id: 'a', text: 'hi', tags: ['Sales', 'sales', 4], favorite: true, uses: -2 },
          { text: 'no id' },
          { id: 'b', text: '  ' },
        ],
      }),
    ).toEqual({
      ...defaults,
      customWords: ['kik'],
      templates: [{ id: 'a', text: 'hi', tags: ['Sales'], favorite: true, uses: 0, createdAt: expect.any(Number) }],
    });
  });
});

describe('mergeFans', () => {
  it('keeps every note and tag once, newest note first', () => {
    const local = fan({ tags: ['vip'], notes: [{ id: 'a', text: 'local', createdAt: 2 }], createdAt: 5, updatedAt: 5 });
    const incoming = fan({
      tags: ['vip', 'birthday'],
      notes: [
        { id: 'a', text: 'local', createdAt: 2 },
        { id: 'b', text: 'from backup', createdAt: 3 },
      ],
      createdAt: 1,
      updatedAt: 9,
    });
    const merged = mergeFans(local, incoming);
    expect(merged.tags).toEqual(['vip', 'birthday']);
    expect(merged.notes.map((n) => n.id)).toEqual(['b', 'a']);
    expect(merged.createdAt).toBe(1);
    expect(merged.updatedAt).toBe(9);
  });

  it('keeps the copy of a note edited last', () => {
    const edited = { id: 'a', text: 'moved to Texas', createdAt: 2, updatedAt: 8 };
    const old = { id: 'a', text: 'lives in Ohio', createdAt: 2 };
    expect(mergeFans(fan({ notes: [old] }), fan({ notes: [edited] })).notes).toEqual([edited]);
    expect(mergeFans(fan({ notes: [edited] }), fan({ notes: [old] })).notes).toEqual([edited]);
  });

  it('keeps the fresher fan stats', () => {
    const older = { items: [{ label: 'Spent', value: '$4' }], fetchedAt: 1 };
    const newer = { items: [{ label: 'Spent', value: '$40' }], fetchedAt: 2 };
    expect(mergeFans(fan({ stats: newer }), fan({ stats: older })).stats).toEqual(newer);
    expect(mergeFans(fan({ stats: older }), fan({ stats: newer })).stats).toEqual(newer);
    expect(mergeFans(fan({}), fan({ stats: older })).stats).toEqual(older);
  });

  it('prefers local names and falls back to the backup', () => {
    const merged = mergeFans(fan({ alias: 'Mine', name: '' }), fan({ alias: 'Theirs', name: 'From site' }));
    expect(merged.alias).toBe('Mine');
    expect(merged.name).toBe('From site');
  });
});

describe('normalizeFan', () => {
  it('rejects records that do not point at a chat', () => {
    expect(normalizeFan(null)).toBeNull();
    expect(normalizeFan({ platform: 'twitter', chatId: '1' })).toBeNull();
    expect(normalizeFan({ platform: 'constructor', chatId: '1' })).toBeNull();
    expect(normalizeFan({ platform: 'onlyfans', chatId: 'abc' })).toBeNull();
    expect(normalizeFan({ platform: 'onlyfans', chatId: 1 })).toBeNull();
  });

  it('drops malformed fields', () => {
    const result = normalizeFan({
      platform: 'fansly',
      chatId: '77',
      alias: 42,
      tags: ['ok', 3, '', 'ok'],
      notes: [{ id: 'n', text: 'fine', createdAt: 4 }, { id: 'e', text: 'edited', createdAt: 4, updatedAt: 6 }, { text: 'no id' }, 'junk'],
    });
    expect(result?.key).toBe('fansly:77');
    expect(result?.alias).toBe('');
    expect(result?.tags).toEqual(['ok']);
    expect(result?.notes).toEqual([
      { id: 'n', text: 'fine', createdAt: 4 },
      { id: 'e', text: 'edited', createdAt: 4, updatedAt: 6 },
    ]);
  });

  it('keeps the fan’s lists from their profile', () => {
    const result = normalizeFan({
      platform: 'onlyfans',
      chatId: '5',
      stats: { items: [{ label: 'Spent', value: '$4' }], lists: ['VIP', 7], fetchedAt: 1 },
    });
    expect(result?.stats).toEqual({ items: [{ label: 'Spent', value: '$4' }], lists: ['VIP'], fetchedAt: 1 });
  });
});
