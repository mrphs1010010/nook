import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  type AiSettings,
  AiError,
  DEFAULT_MODEL,
  SPELLING_MODEL,
  askAi,
  fixSpelling,
  getAiSettings,
  improve,
  listModels,
  lowestEffort,
  parseAnswer,
  saveAiSettings,
  splitVersions,
} from '@/lib/ai';
import { exportBackup } from '@/lib/store';

const ai = { apiKey: 'sk-or-test', model: 'x-ai/grok-4.7', modelName: 'Grok 4.7', effort: 'low' };
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const answer = (content: string) => reply(200, { choices: [{ message: { role: 'assistant', content } }] });
const sent = () => {
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
};

beforeEach(() => {
  fakeBrowser.reset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI settings', () => {
  it('start with no key and the default model', async () => {
    expect(await getAiSettings()).toEqual({
      apiKey: '',
      model: DEFAULT_MODEL.id,
      modelName: DEFAULT_MODEL.name,
      effort: DEFAULT_MODEL.effort,
    });
  });

  it('keep the key out of backups', async () => {
    await saveAiSettings(ai);
    expect((await getAiSettings()).apiKey).toBe('sk-or-test');
    expect(JSON.stringify(await exportBackup())).not.toContain('sk-or-test');
  });
});

describe('fixSpelling', () => {
  it('sends the message to the cheap model and returns its answer', async () => {
    fetchMock.mockResolvedValue(answer("I'll send the video tonight"));
    const result = await fixSpelling("i'll send the vid tonite", { ai });

    expect(result).toEqual({ text: "I'll send the video tonight", model: SPELLING_MODEL.name, fallback: false });
    const { url, headers, body } = sent();
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(headers).toMatchObject({ Authorization: 'Bearer sk-or-test', 'Content-Type': 'application/json' });
    expect(body).toMatchObject({ model: SPELLING_MODEL.id, reasoning: { effort: 'none', exclude: true } });
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[1]).toEqual({ role: 'user', content: "i'll send the vid tonite" });
  });

  it('lets the creator’s model check it when the cheap one says no or fails', async () => {
    const refusals = [
      reply(403, { error: { code: 403, message: 'Input was flagged' } }),
      answer('I’m sorry, but I can’t help with that.'),
      reply(200, { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }),
      reply(200, { choices: [{ message: { content: null, refusal: 'No.' } }] }),
      reply(503, { error: { code: 503, message: 'No providers' } }),
    ];
    for (const refusal of refusals) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(refusal).mockResolvedValueOnce(answer('Miss you, babe'));
      expect(await fixSpelling('miss u babe', { ai })).toEqual({ text: 'Miss you, babe', model: 'Grok 4.7', fallback: true });
      expect(JSON.parse(fetchMock.mock.calls[1]![1].body).model).toBe('x-ai/grok-4.7');
    }
  });

  it('falls back to Grok when the creator picked the cheap model too', async () => {
    fetchMock.mockResolvedValueOnce(answer('I can’t help with that.')).mockResolvedValueOnce(answer('Hi'));
    const result = await fixSpelling('hi', { ai: { ...ai, model: SPELLING_MODEL.id, modelName: SPELLING_MODEL.name } });
    expect(result).toMatchObject({ model: DEFAULT_MODEL.name, fallback: true });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).model).toBe(DEFAULT_MODEL.id);
  });

  it('doesn’t try another model with a bad key or an empty balance', async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { error: { code: 402, message: 'Insufficient credits' } }));
    await expect(fixSpelling('hi', { ai })).rejects.toMatchObject({ status: 402 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a message that itself starts like an apology', async () => {
    fetchMock.mockResolvedValueOnce(answer('I’m sorry, I was busy 🙈'));
    expect(await fixSpelling('im sorry i was busy 🙈', { ai })).toMatchObject({ text: 'I’m sorry, I was busy 🙈', fallback: false });
  });

  it('strips quotes and code blocks the model wraps its answer in', async () => {
    fetchMock.mockResolvedValueOnce(answer('"Miss you, babe"'));
    expect((await fixSpelling('miss u babe', { ai })).text).toBe('Miss you, babe');
    fetchMock.mockResolvedValueOnce(answer('```\nMiss you\n```'));
    expect((await fixSpelling('miss u', { ai })).text).toBe('Miss you');
    fetchMock.mockResolvedValueOnce(answer('"Hi" she said, "bye"'));
    expect((await fixSpelling('x', { ai })).text).toBe('"Hi" she said, "bye"');
  });

  it('needs a key', async () => {
    await expect(fixSpelling('hi', { ai: { ...ai, apiKey: '' } })).rejects.toThrow('Add your OpenRouter key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('requests', () => {
  const attempt = (model: AiSettings = ai) => improve('hi', '', { ai: model, restrictedWords: [] });

  it('leave reasoning settings out for models that don’t reason', async () => {
    fetchMock.mockResolvedValue(answer('ok'));
    await attempt({ apiKey: 'k', model: 'some/model', modelName: 'Some' });
    expect(sent().body).not.toHaveProperty('reasoning');
  });

  it('explain failures in plain words', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: { code: 401, message: 'No auth credentials found' } }));
    await expect(attempt()).rejects.toThrow('didn’t accept the key');

    fetchMock.mockResolvedValueOnce(reply(402, { error: { code: 402, message: 'Insufficient credits' } }));
    await expect(attempt()).rejects.toMatchObject({ status: 402, message: expect.stringContaining('balance is empty') });

    // The model failed after the request was accepted.
    fetchMock.mockResolvedValueOnce(reply(200, { error: { code: 502, message: 'Provider returned error' } }));
    await expect(attempt()).rejects.toThrow('model is down');

    fetchMock.mockResolvedValueOnce(reply(400, { error: { code: 400, message: 'some/model is not a valid model ID' } }));
    await expect(attempt()).rejects.toThrow('some/model is not a valid model ID');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(attempt()).rejects.toThrow('Can’t reach OpenRouter');

    fetchMock.mockResolvedValueOnce(reply(200, { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }));
    await expect(attempt()).rejects.toMatchObject({ status: 403 });

    fetchMock.mockResolvedValueOnce(answer('  '));
    await expect(attempt()).rejects.toBeInstanceOf(AiError);
  });
});

describe('askAi', () => {
  const context = {
    fanName: 'Mike',
    thread: [
      { from: 'me' as const, text: '', media: 'video, $25', time: 'Oct 28, 9:40 pm' },
      { from: 'fan' as const, text: 'send me the beach set again 😍' },
    ],
    card: ['Spent: $1,204.50', 'Lists: Whales'],
    draft: 'hey babe',
    history: [{ ask: 'a few replies', answer: '<msg>hi</msg>', model: 'Grok 4.7', at: 1 }],
    voice: 'lowercase, lots of emojis',
    restrictedWords: ['paypal'],
    restrictedTopics: ['Meeting up and escorting'],
  };

  it('sends the earlier turns, then the chat as it is now with the question', async () => {
    fetchMock.mockResolvedValue(answer(' <msg>ok</msg> '));
    expect(await askAi('make him pay $15', context, { ai })).toBe('<msg>ok</msg>');

    const { messages } = sent().body;
    expect(messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[0].content).toContain('How the creator writes:\nlowercase, lots of emojis');
    expect(messages[0].content).toContain('paypal');
    expect(messages[0].content).toContain('Never touch on these subjects, not even by hint: Meeting up and escorting.');
    expect(messages[1].content).toBe('a few replies');
    expect(messages[2].content).toBe('<msg>hi</msg>');
    expect(messages[3].content).toBe(
      [
        'About Mike:\nSpent: $1,204.50\nLists: Whales',
        'The chat as the page shows it now, oldest first:\n(Oct 28, 9:40 pm) Creator: [video, $25]\nMike: send me the beach set again 😍',
        'Typed in the chat’s message box, not sent yet:\nhey babe',
        'The creator asks:\nmake him pay $15',
      ].join('\n\n'),
    );
  });

  it('leaves out what the creator doesn’t share', async () => {
    fetchMock.mockResolvedValue(answer('ok'));
    await askAi('hi', { ...context, thread: null, card: [], draft: '', history: [], voice: '', restrictedWords: [], restrictedTopics: [] }, { ai });
    const { messages } = sent().body;
    expect(messages).toHaveLength(2);
    expect(messages[0].content).not.toContain('How the creator writes');
    expect(messages[1].content).toBe('The creator asks:\nhi');
  });
});

describe('parseAnswer', () => {
  it('tells notes to the creator from messages to send, in order', () => {
    expect(parseAnswer('Offer something new:\n<msg>"6 new pics, $15"</msg>\n<msg>or a video?</msg>\nGood luck')).toEqual([
      { kind: 'note', text: 'Offer something new:' },
      { kind: 'message', text: '6 new pics, $15' },
      { kind: 'message', text: 'or a video?' },
      { kind: 'note', text: 'Good luck' },
    ]);
  });

  it('copes with a missing closing tag and answers without tags', () => {
    expect(parseAnswer('<msg>hey you')).toEqual([{ kind: 'message', text: 'hey you' }]);
    expect(parseAnswer('He seems shy. </msg>')).toEqual([{ kind: 'note', text: 'He seems shy.' }]);
  });
});

describe('improve', () => {
  it('sends the draft and the instruction, and returns the versions', async () => {
    fetchMock.mockResolvedValue(answer('Hey babe, video tonight\n---\nGuess what drops tonight?\n---\nTonight. New video.'));
    const versions = await improve('hey babe vid tonite', 'make it flirtier', { ai, restrictedWords: ['paypal', 'kik'] });

    expect(versions).toEqual(['Hey babe, video tonight', 'Guess what drops tonight?', 'Tonight. New video.']);
    const { body } = sent();
    expect(body.messages[0].content).toContain('3 clearly different versions');
    expect(body.messages[0].content).toContain('paypal, kik');
    expect(body.messages[1].content).toBe('Draft:\nhey babe vid tonite\n\nInstruction:\nmake it flirtier');
  });

  it('works from just an instruction', async () => {
    fetchMock.mockResolvedValue(answer('One\n---\nTwo'));
    await improve('', 'ask how his weekend was', { ai, restrictedWords: [] });
    expect(sent().body.messages[1].content).toBe('Instruction:\nask how his weekend was');
    expect(sent().body.messages[0].content).toContain('Write the message the instruction asks for');
  });
});

describe('splitVersions', () => {
  it('drops numbering and quotes the model adds anyway', () => {
    expect(splitVersions('1. "Hi babe"\n---\nVersion 2: Hey you\n ---  \n3) Yo')).toEqual(['Hi babe', 'Hey you', 'Yo']);
  });

  it('keeps an answer without separators whole', () => {
    expect(splitVersions('Just one\nwith two lines')).toEqual(['Just one\nwith two lines']);
  });
});

describe('listModels', () => {
  it('lists text models with prices per million tokens and their lowest reasoning setting', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        data: [
          {
            id: 'x-ai/grok-4.7',
            name: 'xAI: Grok 4.7',
            architecture: { output_modalities: ['text'] },
            pricing: { prompt: '0.000002', completion: '0.000006' },
            reasoning: { mandatory: true, supported_efforts: ['xhigh', 'high', 'medium', 'low'] },
            top_provider: { is_moderated: false },
          },
          { id: 'x-ai/grok-4.3:batch', architecture: { output_modalities: ['text'] } },
          { id: 'some/image-model', architecture: { output_modalities: ['image'] } },
        ],
      }),
    );
    expect(await listModels()).toEqual([
      { id: 'x-ai/grok-4.7', name: 'Grok 4.7', inputPrice: 2, outputPrice: 6, effort: 'low', moderated: false },
    ]);
    expect(sent().url).toBe('https://openrouter.ai/api/v1/models');
    expect(sent().headers).not.toHaveProperty('Authorization');
  });
});

describe('lowestEffort', () => {
  it('turns reasoning off when the model allows it, else picks its lowest effort', () => {
    expect(lowestEffort(null)).toBeUndefined();
    expect(lowestEffort({ mandatory: false })).toBe('none');
    expect(lowestEffort({ mandatory: true, supported_efforts: ['high', 'medium', 'low', 'minimal'] })).toBe('minimal');
    expect(lowestEffort({ mandatory: true, supported_efforts: ['high', 'medium'] })).toBe('medium');
  });
});
