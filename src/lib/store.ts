// Everything Nook keeps lives in storage.local: one key per fan ("fan:<platform>:<chatId>"),
// plus "settings" for the lists shared by every chat. Nothing leaves the browser. (The AI
// key and the chats with the AI live there too, apart: see ai.ts and aiChat.ts.)

import { browser } from 'wxt/browser';
import { type Chat, type PlatformId, fanKey, isPlatformId } from './platforms';

export interface Note {
  id: string;
  text: string;
  createdAt: number;
  updatedAt?: number; // when the text was last edited
}

// What the site last showed about the fan's spending, and when it was read.
export interface SavedStats {
  items: { label: string; value: string }[]; // e.g. Spent → $4, subscribed for → 3 months
  period?: string; // e.g. Lifetime, on Fansly
  lists?: string[]; // the creator's lists the fan is on, e.g. VIP
  missing?: boolean; // the profile said "this page is not available": the account is deleted or banned
  fetchedAt: number;
}

export interface Fan {
  key: string;
  platform: PlatformId;
  chatId: string;
  name: string; // as shown on the site
  username: string; // as shown on the site, without "@"
  alias: string; // the creator's own name for this fan
  tags: string[];
  notes: Note[]; // shown oldest first
  stats?: SavedStats;
  createdAt: number;
  updatedAt: number;
}

// A saved reply. "{name}" in the text stands for the fan's name.
export interface Template {
  id: string;
  text: string;
  tags: string[];
  favorite: boolean;
  uses: number; // times it was put in a chat, to list the usual ones first
  createdAt: number;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  customWords: string[]; // the creator's own restricted words, held back on every site (see restricted.ts)
  allowedWords: string[]; // never flagged, even when a list has them: the creator's own @names
  allowedOn: Partial<Record<PlatformId, string[]>>; // the same, on one site only (see wordLists.ts)
  holdBack: boolean; // swallow Enter and Send while a held-back word is in the message
  templates: Template[];
  insertIntoChat: boolean; // put templates and AI text straight into the chat box, rather than copy them
  theme: Theme;
  autoSpending: boolean; // open a fan's OnlyFans profile on its own when their chat is opened
  // What the chat with the AI may see, see What AI sees.
  aiSeesChat: boolean; // the messages on the page
  aiSeesCard: boolean; // the fan's spending, subscription and lists
  aiRemembers: boolean; // the last turns with the AI about the fan
  voice: string; // how the creator writes, in their own words
}

export interface Backup {
  app: 'nook';
  version: 1;
  exportedAt: string;
  fans: Fan[];
  settings?: Settings; // missing in backups made before settings existed
}

const PREFIX = 'fan:';
const SETTINGS = 'settings';

export function newFan({ platform, chatId }: Pick<Chat, 'platform' | 'chatId'>): Fan {
  const now = Date.now();
  return {
    key: fanKey(platform, chatId),
    platform,
    chatId,
    name: '',
    username: '',
    alias: '',
    tags: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function getFan(key: string): Promise<Fan | null> {
  const result = await browser.storage.local.get(PREFIX + key);
  return (result[PREFIX + key] as Fan | undefined) ?? null;
}

// All fans, most recently edited first.
export async function listFans(): Promise<Fan[]> {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(PREFIX))
    .map(([, fan]) => fan as Fan)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Calls back whenever any fan changes. Returns an unsubscribe function.
export function onFansChanged(callback: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && Object.keys(changes).some((key) => key.startsWith(PREFIX))) callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

// Writes run one after another, so read-modify-write cycles never interleave.
let writes: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writes.then(task);
  writes = run.catch(() => {}); // one failed write must not block the next
  return run;
}

// Applies `mutate` to the stored fan and saves it. The record is created if missing,
// unless `create` is false. `mutate` can return false to skip saving.
export function updateFan(
  chat: Pick<Chat, 'platform' | 'chatId' | 'key'>,
  mutate: (fan: Fan) => void | false,
  { create = true } = {},
): Promise<void> {
  return enqueue(async () => {
    const stored = await getFan(chat.key);
    if (!stored && !create) return;
    const fan = stored ?? newFan(chat);
    if (mutate(fan) === false) return;
    await browser.storage.local.set({ [PREFIX + fan.key]: fan });
  });
}

const defaultSettings = (): Settings => ({
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
});

export async function getSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(SETTINGS))[SETTINGS];
  return normalizeSettings(stored) ?? defaultSettings();
}

export function updateSettings(mutate: (settings: Settings) => void | false): Promise<void> {
  return enqueue(async () => {
    const settings = await getSettings();
    if (mutate(settings) === false) return;
    await browser.storage.local.set({ [SETTINGS]: settings });
  });
}

// Calls back with the new settings whenever they change. Returns an unsubscribe function.
export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && SETTINGS in changes) getSettings().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'nook',
    version: 1,
    exportedAt: new Date().toISOString(),
    fans: await listFans(),
    settings: await getSettings(),
  };
}

// Merges a backup into what is already stored. Returns how many fans were imported.
export function importBackup(data: unknown): Promise<number> {
  return enqueue(async () => {
    const backup = data as Partial<Backup> | null;
    if (backup?.app !== 'nook' || !Array.isArray(backup.fans)) throw new Error('Not a Nook backup file');
    const incoming = backup.fans.map(normalizeFan).filter((fan): fan is Fan => fan !== null);
    const existing = new Map((await listFans()).map((fan) => [fan.key, fan]));
    const updates: Record<string, Fan | Settings> = {};
    for (const fan of incoming) {
      const local = existing.get(fan.key);
      updates[PREFIX + fan.key] = local ? mergeFans(local, fan) : fan;
    }
    const settings = normalizeSettings(backup.settings);
    if (settings) {
      const stored = (await browser.storage.local.get(SETTINGS))[SETTINGS];
      updates[SETTINGS] = stored ? mergeSettings(await getSettings(), settings) : settings;
    }
    await browser.storage.local.set(updates);
    return incoming.length;
  });
}

// Coerces an untrusted record (from a backup file) into a valid fan, or null.
export function normalizeFan(raw: unknown): Fan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isPlatformId(r.platform) || typeof r.chatId !== 'string' || !/^\d+$/.test(r.chatId)) return null;
  const str = (value: unknown) => (typeof value === 'string' ? value : '');
  const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Date.now());
  const notes = Array.isArray(r.notes) ? (r.notes as Record<string, unknown>[]) : [];
  const stats = r.stats as Record<string, unknown> | undefined;
  const statItems = Array.isArray(stats?.items)
    ? (stats.items as Record<string, unknown>[]).filter((i) => i && typeof i.label === 'string' && typeof i.value === 'string')
    : [];
  return {
    ...newFan({ platform: r.platform, chatId: r.chatId }),
    ...((statItems.length || stats?.missing === true) && {
      stats: {
        items: statItems.map((i) => ({ label: i.label as string, value: i.value as string })),
        ...(typeof stats?.period === 'string' && stats.period && { period: stats.period }),
        ...(Array.isArray(stats?.lists) && { lists: stats.lists.filter((l): l is string => typeof l === 'string') }),
        ...(stats?.missing === true && { missing: true }),
        fetchedAt: time(stats?.fetchedAt),
      },
    }),
    name: str(r.name),
    username: str(r.username),
    alias: str(r.alias),
    tags: Array.isArray(r.tags) ? [...new Set(r.tags.filter((t): t is string => typeof t === 'string' && t !== ''))] : [],
    notes: notes
      .filter((n) => n && typeof n.text === 'string' && typeof n.id === 'string')
      .map((n) => ({
        id: n.id as string,
        text: n.text as string,
        createdAt: time(n.createdAt),
        ...(typeof n.updatedAt === 'number' && Number.isFinite(n.updatedAt) && { updatedAt: n.updatedAt }),
      })),
    createdAt: time(r.createdAt),
    updatedAt: time(r.updatedAt),
  };
}

// Combines two records of the same fan: union of notes and tags (of two copies of a note,
// the one edited last), local fields win, and the fresher stats.
export function mergeFans(local: Fan, incoming: Fan): Fan {
  const edited = (note: Note) => note.updatedAt ?? note.createdAt;
  const notes = new Map<string, Note>();
  for (const note of [...incoming.notes, ...local.notes]) {
    const other = notes.get(note.id);
    if (!other || edited(note) >= edited(other)) notes.set(note.id, note);
  }
  const stats = (incoming.stats?.fetchedAt ?? 0) > (local.stats?.fetchedAt ?? 0) ? incoming.stats : local.stats;
  return {
    ...local,
    ...(stats && { stats }),
    name: local.name || incoming.name,
    username: local.username || incoming.username,
    alias: local.alias || incoming.alias,
    tags: [...new Set([...local.tags, ...incoming.tags])],
    notes: [...notes.values()].sort((a, b) => b.createdAt - a.createdAt),
    createdAt: Math.min(local.createdAt, incoming.createdAt),
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
  };
}

// Coerces stored or untrusted settings (from a backup file), or null when there are none.
// Anything missing or malformed falls back to the default.
export function normalizeSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const defaults = defaultSettings();
  const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    customWords: customWordsOf(r),
    allowedWords: uniqueWords(strings(r.allowedWords)),
    allowedOn: allowedOnOf(r.allowedOn),
    holdBack: flag(r.holdBack, defaults.holdBack),
    templates: (Array.isArray(r.templates) ? r.templates : []).flatMap(normalizeTemplate),
    insertIntoChat: flag(r.insertIntoChat, defaults.insertIntoChat),
    theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : 'system',
    autoSpending: flag(r.autoSpending, defaults.autoSpending),
    aiSeesChat: flag(r.aiSeesChat, defaults.aiSeesChat),
    aiSeesCard: flag(r.aiSeesCard, defaults.aiSeesCard),
    aiRemembers: flag(r.aiRemembers, defaults.aiRemembers),
    voice: typeof r.voice === 'string' ? r.voice : '',
  };
}

function normalizeTemplate(raw: unknown): Template[] {
  const t = (raw ?? {}) as Record<string, unknown>;
  if (typeof t.id !== 'string' || typeof t.text !== 'string' || !t.text.trim()) return [];
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return [
    {
      id: t.id,
      text: t.text,
      tags: uniqueWords(strings(t.tags)),
      favorite: t.favorite === true,
      uses: count(t.uses),
      createdAt: typeof t.createdAt === 'number' && Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
    },
  ];
}

// Both lists of words, and every template of either; for the rest, and templates with the
// same id, what is already here wins.
export function mergeSettings(local: Settings, incoming: Settings): Settings {
  const localIds = new Set(local.templates.map((t) => t.id));
  return {
    ...local,
    voice: local.voice || incoming.voice,
    customWords: uniqueWords([...local.customWords, ...incoming.customWords]),
    allowedWords: uniqueWords([...local.allowedWords, ...incoming.allowedWords]),
    allowedOn: Object.fromEntries(
      [...new Set([...Object.keys(local.allowedOn), ...Object.keys(incoming.allowedOn)])].map((site) => [
        site,
        uniqueWords([...(local.allowedOn[site as PlatformId] ?? []), ...(incoming.allowedOn[site as PlatformId] ?? [])]),
      ]),
    ),
    templates: [...local.templates, ...incoming.templates.filter((t) => !localIds.has(t.id))],
  };
}

// Placeholders an earlier version started with, under "restrictedWords"; the built-in lists
// cover them now.
const OLD_PLACEHOLDERS = ['paypal', 'cashapp', 'venmo', 'zelle', 'telegram', 'whatsapp', 'snapchat', 'meet up'];

// The creator's words; settings saved before the built-in lists kept them as "restrictedWords".
function customWordsOf(r: Record<string, unknown>): string[] {
  if (Array.isArray(r.customWords)) return uniqueWords(strings(r.customWords));
  const old = uniqueWords(strings(r.restrictedWords));
  return old.join() === OLD_PLACEHOLDERS.join() ? [] : old;
}

function allowedOnOf(raw: unknown): Settings['allowedOn'] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(r).flatMap(([platform, words]) => (isPlatformId(platform) ? [[platform, uniqueWords(strings(words))]] : [])));
}

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()) : [];

// Drops blanks and repeats, ignoring case; the first spelling stays.
export function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = word.toLowerCase();
    if (!word || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
