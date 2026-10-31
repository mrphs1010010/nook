// Fixing, improving and writing messages with an AI model through OpenRouter, on the
// creator's own key, and only when the creator asks. Spelling and Improve send just the
// message (and, to keep them out, the restricted words). The chat with the AI also sends what
// the creator lets it see in What AI sees: the messages on the page, the fan's card, the
// last turns of that chat. The key stays in this browser and is left out of backups.

import { browser } from 'wxt/browser';
import type { ChatLine } from './page';

const API = 'https://openrouter.ai/api/v1';
const STORAGE_KEY = 'ai';

export interface AiSettings {
  apiKey: string;
  model: string; // an OpenRouter model id
  modelName: string; // as OpenRouter lists it, for showing
  effort?: string; // the reasoning setting to send; unset for models that don't reason
}

// Until the creator picks another one.
export const DEFAULT_MODEL = { id: 'x-ai/grok-4.7', name: 'Grok 4.7', effort: 'low' };

export async function getAiSettings(): Promise<AiSettings> {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Partial<AiSettings> | undefined;
  return { apiKey: '', model: DEFAULT_MODEL.id, modelName: DEFAULT_MODEL.name, effort: DEFAULT_MODEL.effort, ...stored };
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

// Calls back with the new AI settings whenever they change. Returns an unsubscribe function.
export function onAiSettingsChanged(callback: (settings: AiSettings) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && STORAGE_KEY in changes) getAiSettings().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

// A failed request, with a message to show the creator.
export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const FRIENDLY: Record<number, string> = {
  401: 'OpenRouter didn’t accept the key. Check it in Settings.',
  402: 'Your OpenRouter balance is empty. Add credits on openrouter.ai.',
  403: 'The model refused this message. Try another model in Settings.',
  408: 'The model took too long. Try again.',
  429: 'Too many requests. Wait a moment and try again.',
  502: 'The model is down right now. Try again or pick another model.',
  503: 'No provider can run this model right now. Try again or pick another model.',
};

async function request(path: string, init: RequestInit & { apiKey?: string }): Promise<any> {
  const { apiKey, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...rest,
      headers: {
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        ...(rest.body && { 'Content-Type': 'application/json' }),
        'X-OpenRouter-Title': 'Nook', // names the app in the creator's OpenRouter activity
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new AiError('Can’t reach OpenRouter. Check your connection.');
  }
  const body = await response.json().catch(() => null);
  // A model can also fail after the request was accepted: then the status is 200 with an error inside.
  const error = body?.error as { code?: number; message?: string } | undefined;
  if (!response.ok || error) {
    const status = response.ok ? Number(error?.code) || 0 : response.status;
    throw new AiError(FRIENDLY[status] ?? error?.message ?? `OpenRouter answered ${status}.`, status);
  }
  return body;
}

const CONTEXT = 'The message is from a content creator to a fan on a subscription site.';

// The creator's own words go by name; the built-in red list by subject, which is shorter and
// covers words the list doesn't have. Whatever slips through is caught when it's shown.
function avoid(words: string[], topics: string[] = []) {
  return [
    topics.length > 0 && `Never touch on these subjects, not even by hint: ${topics.join(', ')}.`,
    words.length > 0 && `Never use these words or phrases, not even disguised; write around them: ${words.join(', ')}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Models sometimes wrap the answer in quotes or a code block anyway.
function unwrap(text: string): string {
  const result = text.trim().replace(/^```\w*\n([\s\S]*)\n```$/, '$1');
  const quoted = /^["“«]([^"“”«»]*)["”»]$/.exec(result);
  return (quoted ? quoted[1]! : result).trim();
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const prompt = (system: string, user: string): ChatMessage[] => [
  { role: 'system', content: system },
  { role: 'user', content: user },
];

async function complete(ai: AiSettings, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  if (!ai.apiKey) throw new AiError('Add your OpenRouter key in Settings first.');
  const body = await request('/chat/completions', {
    method: 'POST',
    apiKey: ai.apiKey,
    signal,
    body: JSON.stringify({
      model: ai.model,
      messages,
      max_tokens: 4000, // room for the model's reasoning as well as the answer
      ...(ai.effort && { reasoning: { effort: ai.effort, exclude: true } }),
    }),
  });
  const choice = body?.choices?.[0];
  // Models whose provider filters content say no this way, rather than with an error.
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) throw new AiError(FRIENDLY[403]!, 403);
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AiError('The model sent back nothing. Try again.');
  return content;
}

// Spelling goes to a cheap model first. Its provider filters adult content, so when it says
// no (or isn't there), the creator's own model checks the message instead.
export const SPELLING_MODEL = { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', effort: 'none' };

export interface SpellingResult {
  text: string;
  model: string; // the name of the model that checked it
  fallback: boolean; // the cheap model refused or failed, so the creator's model checked it
}

export async function fixSpelling(text: string, { ai, signal }: { ai: AiSettings; signal?: AbortSignal }): Promise<SpellingResult> {
  const system = [
    'Fix the spelling, grammar and punctuation of the chat message you are given. Change as little as possible: keep the wording, tone, slang, emojis, letter case and line breaks. If nothing needs fixing, return it unchanged.',
    CONTEXT,
    'Reply with the message only: no quotes, notes or explanations.',
  ].join('\n');
  const cheap = { ...ai, model: SPELLING_MODEL.id, modelName: SPELLING_MODEL.name, effort: SPELLING_MODEL.effort };
  try {
    const fixed = unwrap(await complete(cheap, prompt(system, text), signal));
    if (!looksRefused(text, fixed)) return { text: fixed, model: SPELLING_MODEL.name, fallback: false };
  } catch (error) {
    // A bad key or an empty balance would fail the other model too.
    if (!(error instanceof AiError) || error.status === 401 || error.status === 402) throw error;
  }
  const own = ai.model === SPELLING_MODEL.id ? { ...ai, model: DEFAULT_MODEL.id, modelName: DEFAULT_MODEL.name, effort: DEFAULT_MODEL.effort } : ai;
  return { text: unwrap(await complete(own, prompt(system, text), signal)), model: own.modelName, fallback: true };
}

// A model that won't touch a message answers with an apology instead of it: one that starts
// like a refusal and keeps fewer than half of the message's words.
const REFUSAL = /^(?:i['’]m sorry|sorry,? (?:but )?i\b|i can(?:['’]t|not)\b|i won['’]t\b|i['’]m (?:not able|unable)\b|i am (?:not able|unable)\b|as an ai\b)/i;

export function looksRefused(original: string, answer: string): boolean {
  if (!REFUSAL.test(answer.trim())) return false;
  const words = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const kept = new Set(words(answer));
  const asked = words(original);
  return asked.filter((word) => kept.has(word)).length < asked.length / 2;
}

// A few versions of a message, written from the creator's draft, their instruction, or both.
export async function improve(
  draft: string,
  instruction: string,
  {
    ai,
    restrictedWords,
    restrictedTopics = [],
    count = 3,
    signal,
  }: { ai: AiSettings; restrictedWords: string[]; restrictedTopics?: string[]; count?: number; signal?: AbortSignal },
): Promise<string[]> {
  const task = !instruction
    ? 'Rewrite the draft so it reads better and draws the reader in, in the same voice and mood, about the same length.'
    : draft
      ? 'Rewrite the draft following the instruction.'
      : 'Write the message the instruction asks for.';
  const system = [
    `Write ${count} clearly different versions of a chat message. ${task}`,
    CONTEXT,
    'Write in the language of the draft, or of the instruction when there is no draft. Keep any emojis the draft has.',
    avoid(restrictedWords, restrictedTopics),
    'Reply with the versions only, separated by a line holding just ---. No numbering, quotes, notes or explanations.',
  ]
    .filter(Boolean)
    .join('\n');
  const user = [draft && `Draft:\n${draft}`, instruction && `Instruction:\n${instruction}`].filter(Boolean).join('\n\n');
  return splitVersions(await complete(ai, prompt(system, user), signal)).slice(0, count);
}

// One exchange of the creator's chat with the AI about a fan.
export interface AiTurn {
  ask: string;
  answer: string; // as the model wrote it, messages to send between <msg> and </msg>
  model: string; // the name of the model that answered
  at: number;
}

// What the AI is told along with the creator's question.
export interface AskContext {
  fanName: string; // as the site shows it, first name
  thread: ChatLine[] | null; // the chat on the page; null when the creator doesn't share it
  card: string[]; // e.g. "Spent: $1,204.50"; empty when the creator doesn't share it
  draft: string; // what is typed in the chat's message box
  history: AiTurn[]; // earlier turns about this fan, oldest first
  voice: string; // how the creator writes, in their own words
  restrictedWords: string[]; // the creator's own
  restrictedTopics: string[]; // what the built-in red list is about
}

// The creator's question or request about the open chat. The answer can hold messages to
// send, each between <msg> and </msg>: see parseAnswer.
export async function askAi(question: string, context: AskContext, { ai, signal }: { ai: AiSettings; signal?: AbortSignal }): Promise<string> {
  const system = [
    'You help a content creator chat with a fan on a subscription site such as OnlyFans or Fansly. You talk to the creator, never to the fan.',
    'When you write a message for the creator to send, write it as the creator and put it between <msg> and </msg>, one message per pair of tags. Give two or three clearly different ones when asked for options, or when it helps. Anything outside the tags is a short note to the creator: a sentence or two, or nothing.',
    'Write messages in the language the fan writes in, unless asked otherwise. Never make up facts, prices or content the creator hasn’t mentioned.',
    context.voice.trim() && `How the creator writes:\n${context.voice.trim()}`,
    avoid(context.restrictedWords, context.restrictedTopics),
  ]
    .filter(Boolean)
    .join('\n\n');
  const messages: ChatMessage[] = [{ role: 'system', content: system }];
  for (const turn of context.history) {
    messages.push({ role: 'user', content: turn.ask }, { role: 'assistant', content: turn.answer });
  }
  messages.push({ role: 'user', content: [describe(context), `The creator asks:\n${question.trim()}`].filter(Boolean).join('\n\n') });
  return (await complete(ai, messages, signal)).trim();
}

// The context, fresh for each question: the chat may have moved on since the last one.
function describe({ fanName, thread, card, draft }: AskContext): string {
  const fan = fanName || 'Fan';
  return [
    card.length > 0 && `About ${fan}:\n${card.join('\n')}`,
    thread && (thread.length ? `The chat as the page shows it now, oldest first:\n${thread.map((line) => chatLine(line, fan)).join('\n')}` : 'The chat shows no messages yet.'),
    draft.trim() && `Typed in the chat’s message box, not sent yet:\n${draft.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// "(Oct 19, 9:47 pm) Creator: [photo] text"
export function chatLine(line: ChatLine, fan: string): string {
  const text = [line.media && `[${line.media}]`, line.text].filter(Boolean).join(' ');
  return `${line.time ? `(${line.time}) ` : ''}${line.from === 'me' ? 'Creator' : fan}: ${text}`;
}

export interface AnswerPart {
  kind: 'note' | 'message'; // a note to the creator, or a message to send
  text: string;
}

// An answer cut into notes and messages to send, in order.
export function parseAnswer(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const note = (text: string) => {
    const clean = text.replace(/<\/?msg>/gi, '').trim();
    if (clean) parts.push({ kind: 'note', text: clean });
  };
  let at = 0;
  for (const match of answer.matchAll(/<msg>([\s\S]*?)(?:<\/msg>|$)/gi)) {
    note(answer.slice(at, match.index));
    const text = unwrap(match[1]!.trim());
    if (text) parts.push({ kind: 'message', text });
    at = match.index! + match[0].length;
  }
  note(answer.slice(at));
  return parts;
}

// The model's answer cut into versions, without any numbering it added anyway.
export function splitVersions(answer: string): string[] {
  return answer
    .split(/^\s*-{3,}\s*$/m)
    .map((part) => unwrap(part.trim().replace(/^(?:version\s*)?\d+\s*[.):-]\s*/i, '')))
    .filter(Boolean);
}

export interface AiModel {
  id: string;
  name: string;
  inputPrice: number; // USD per million tokens
  outputPrice: number;
  effort?: string;
  moderated: boolean; // the provider filters content, so it may refuse adult messages
}

// The cheapest reasoning setting a model takes: off when it can be, else its lowest effort.
export function lowestEffort(reasoning: { mandatory?: boolean; supported_efforts?: string[] } | null | undefined) {
  if (!reasoning) return undefined;
  if (!reasoning.mandatory) return 'none';
  return ['minimal', 'low', 'medium', 'high'].find((effort) => reasoning.supported_efforts?.includes(effort)) ?? 'low';
}

// Every OpenRouter model that writes text. The list is public: no key needed.
export async function listModels(signal?: AbortSignal): Promise<AiModel[]> {
  const body = await request('/models', { signal });
  const models = Array.isArray(body?.data) ? (body.data as Record<string, any>[]) : [];
  return models
    .filter((m) => typeof m.id === 'string' && !m.id.endsWith(':batch') && m.architecture?.output_modalities?.includes('text'))
    .map((m) => ({
      id: m.id,
      name: typeof m.name === 'string' ? m.name.replace(/^[^:]{1,40}:\s*/, '') : m.id, // "xAI: Grok 4.7" → "Grok 4.7"
      inputPrice: Number(m.pricing?.prompt ?? 0) * 1e6,
      outputPrice: Number(m.pricing?.completion ?? 0) * 1e6,
      effort: lowestEffort(m.reasoning),
      moderated: m.top_provider?.is_moderated === true,
    }));
}

// Whether OpenRouter accepts the key, and how much of its spending cap is left (null: no cap).
export async function checkKey(apiKey: string, signal?: AbortSignal): Promise<{ remaining: number | null }> {
  const body = await request('/key', { apiKey, signal });
  const remaining = body?.data?.limit_remaining;
  return { remaining: typeof remaining === 'number' ? remaining : null };
}
