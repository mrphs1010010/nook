// A stand-in for the chrome.* APIs the side panel uses, so the panel UI can be opened
// in an ordinary tab during development (see scripts/panel-preview.mjs). Data lives in
// memory and resets on reload.
//
// ?url=<address> sets the "active tab" (defaults to an OnlyFans chat).
// ?script=off acts as a tab Nook's page script never got into (it answers nothing).
// ?ai=fake answers OpenRouter requests with canned text instead of calling it, and saves a fake key.
// ?luna=refuse makes the cheap spelling model refuse, so the creator's model checks instead.
// window.nookNavigate(url) simulates the tab moving to another page.
// window.nookPageReport({ name, username }) simulates the content script reporting the page.
// On OnlyFans chat pages the content script also reports the chat list (fakeChats).
// window.nookType(text) simulates typing in the chat's message box; window.nookPressEnter()
// simulates pressing Enter, which the guard holds back if the text has a restricted word.
(() => {
  const params = new URLSearchParams(location.search);
  let activeUrl = params.get('url') ?? 'https://onlyfans.com/my/chats/chat/123456789/';

  // What the content script would read from each chat's header.
  const fakePages = {
    123456789: { name: 'Jessica Rose', username: 'jessrose' },
    555000111: { name: 'Mike T', username: 'miket' },
  };
  const fakePage = () => fakePages[activeUrl.match(/\d+/)?.[0]] ?? { name: '', username: '' };

  // OnlyFans' chat list, top to bottom, as the content script would read it.
  const chat = (chatId, name, username, lastMessage, time, unread = false) => ({ chatId, name, username, lastMessage, time, unread });
  const fakeChats = [
    chat('555000111', 'Mike T', 'miket', 'send me the beach set again 😍', '2m', true),
    chat('555000222', 'Daniel R', 'dannyr88', 'Good morning ☀️ did you sleep well?', '14m'),
    chat('555000333', 'Zach', 'zach_k', 'haha you’re too much', '1h', true),
    chat('381927034', 'u381927034', 'u381927034', 'Tip $5', '2h', true),
    chat('555000555', 'Chris Wells', 'cwells', 'Media', '3h'),
    chat('555000666', 'Alex', 'alexm', 'ok', '5h'),
    chat('555000777', 'Ryan B', 'ryanb', 'when’s the next live?', 'Yesterday'),
    chat('555000888', 'Kevin', 'kev_in', 'Miss you! What have you been up to?', 'Yesterday'),
    chat('123456789', 'Jessica Rose', 'jessrose', '😂😂', 'Oct 29'),
    chat('555000999', 'Sam', 'samj', 'Customs are open this week!', 'Oct 28'),
  ];
  const chatList = () => (/^https:\/\/onlyfans\.com\/my\/chats/.test(activeUrl) ? fakeChats : null);

  // The open chat's messages, oldest first, as the content script would read them.
  const line = (from, text, time, media) => ({ from, text, time, ...(media && { media }) });
  const fakeThreads = {
    555000111: [
      line('me', '', 'Oct 28, 9:40 pm', 'video, $25'),
      line('fan', 'you looked insane in that beach set 😍', 'Oct 31, 9:41 am'),
      line('me', 'haha you liked it? 🙈', 'Oct 31, 9:44 am'),
      line('fan', 'liked it?? i’ve watched it like 10 times', 'Oct 31, 9:45 am'),
      line('fan', 'send me the beach set again 😍 the one with the red bikini', 'Oct 31, 9:52 am'),
    ],
    123456789: [line('fan', 'did you see my message from yesterday?', 'Oct 30, 11:02 pm'), line('fan', '😂😂', 'Oct 30, 11:03 pm')],
  };
  const thread = () => (/\/chat\/\d+/.test(activeUrl) ? (fakeThreads[activeUrl.match(/\d+/)[0]] ?? []) : null);

  // The chat's message box. Restricted words are found by a plain whole-word search here; the
  // real matcher, with the built-in list, lives in the content script.
  let typed = '';
  const draft = () => {
    const found = (words) =>
      words.flatMap((word) => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return [...typed.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'))].map((m) => ({
          start: m.index,
          end: m.index + m[0].length,
          word,
        }));
      });
    const matches = found(store.settings.customWords).sort((a, b) => a.start - b.start);
    return { url: activeUrl, inputFound: true, text: typed, matches };
  };

  const day = 24 * 60 * 60 * 1000;
  const template = (id, text, tags, favorite = false, uses = 0) => ({ id, text, tags, favorite, uses, createdAt: Number(id.slice(1)) });
  const store = {
    settings: {
      customWords: ['paypal', 'cashapp', 'telegram', 'snapchat', 'kik', 'meet up', 'pink panda', 'pay*', '*gram', '@*'],
      allowedWords: ['@jessrose'],
      allowedOn: { fansly: ['hotel'] },
      holdBack: true,
      insertIntoChat: true,
      theme: params.get('theme') ?? 'system',
      templates: [
        template('t1', 'Good morning {name} ☀️ did you sleep well? I woke up thinking about you', ['morning', 'warm-up'], true, 41),
        template('t2', 'Hey {name}, I just shot a new set and you’re the first one I’m telling 🙈 want a sneak peek?', ['ppv', 'tease'], true, 28),
        template('t3', 'Thank you so much for the tip babe, you just made my whole day 💕', ['thanks'], true, 19),
        template('t4', 'Miss you {name}! Haven’t heard from you in a while, what have you been up to?', ['re-engage'], false, 12),
        template('t5', 'I have a little something just for you… unlock it and tell me what you think 😏', ['ppv', 'tease'], false, 9),
        template('t6', 'Customs are open this week! Tell me what you’d love to see and I’ll send you a price', ['customs'], false, 7),
        template('t7', 'Tip me on cashapp for a bonus pic', ['old'], false, 2),
        template('t8', 'Good night {name} 🌙 sweet dreams, talk tomorrow?', ['night', 'warm-up'], false, 5),
      ],
    },
    ...Object.fromEntries(
      [
        ['555000222', 'Daniel R', 'dannyr88', '$86'],
        ['555000333', 'Zach', 'zach_k', '$640'],
        ['555000555', 'Chris Wells', 'cwells', '$2,310.00', ['Whales', 'Customs']],
        ['555000666', 'Alex', 'alexm', '$0'],
        ['555000888', 'Kevin', 'kev_in', '$312.40'],
        ['123456789', 'Jessica Rose', 'jessrose', '$45'],
      ].map(([chatId, name, username, spent, lists]) => [
        `fan:onlyfans:${chatId}`,
        {
          key: `onlyfans:${chatId}`, platform: 'onlyfans', chatId, name, username, alias: '', tags: [], notes: [],
          stats: { items: [{ label: 'Spent', value: spent }], ...(lists && { lists }), fetchedAt: Date.now() - 2 * 60 * 60 * 1000 },
          createdAt: Date.now() - 10 * day, updatedAt: Date.now() - day,
        },
      ]),
    ),
    'fan:onlyfans:555000111': {
      key: 'onlyfans:555000111',
      platform: 'onlyfans',
      chatId: '555000111',
      name: 'Mike T',
      username: 'miket',
      alias: 'Mike (the golfer)',
      tags: [],
      notes: [{ id: 'n1', text: 'Plays golf on weekends. Bought the beach set twice.', createdAt: Date.now() - 2 * day }],
      stats: {
        items: [
          { label: 'subscribed for', value: '3 months' },
          { label: 'Spent', value: '$1,204.50' },
        ],
        lists: ['🐳 Whales', 'Customs'],
        fetchedAt: Date.now() - 40 * 60 * 1000,
      },
      createdAt: Date.now() - 30 * day,
      updatedAt: Date.now() - 2 * day,
    },
  };
  if (params.get('ai') === 'fake') store.ai = { apiKey: 'sk-or-v1-fake0000000000000000', model: 'x-ai/grok-4.7', modelName: 'Grok 4.7', effort: 'low' };

  const event = () => {
    const listeners = new Set();
    return {
      listeners,
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    };
  };
  const onActivated = event();
  const onUpdated = event();
  const onMessage = event();
  const onChanged = event();
  const tab = () => ({ id: 1, windowId: 1, active: true, url: activeUrl });
  const report = (message) => onMessage.listeners.forEach((fn) => fn(message, { tab: tab() }));

  window.chrome = {
    windows: { getCurrent: async () => ({ id: 1 }) },
    tabs: {
      query: async () => [tab()],
      update: async (_tabId, { url }) => window.nookNavigate(url),
      reload: async () => location.reload(),
      sendMessage: async (_tabId, message) => {
        if (params.get('script') === 'off') throw new Error('Could not establish connection. Receiving end does not exist.');
        if (message?.type === 'nook:get-draft') return draft();
        if (message?.type === 'nook:get-chat-list') return chatList();
        if (message?.type === 'nook:get-thread') return thread();
        if (message?.type === 'nook:insert') {
          window.nookType(message.replace ? message.text : typed + message.text);
          return true;
        }
        return { url: activeUrl, ...fakePage() };
      },
      onActivated,
      onUpdated,
    },
    // "Check spending": pretend each profile is read a moment later.
    runtime: {
      onMessage,
      sendMessage: async (message) => {
        if (message?.type !== 'nook:fetch-stats' || store[`fan:${message.chat.key}`]?.stats) return;
        const { chatId, key } = message.chat;
        setTimeout(() => {
          const spent = { 381927034: '$12', 555000777: '$264.30', 555000999: '$0' }[chatId] ?? '$0';
          const fan = store[`fan:${key}`] ?? { key, platform: 'onlyfans', chatId, name: '', username: '', alias: '', tags: [], notes: [], createdAt: Date.now(), updatedAt: Date.now() };
          // Sam's account is gone: the profile says "this page is not available".
          const stats = chatId === '555000999' ? { items: [], missing: true, fetchedAt: Date.now() } : { items: [{ label: 'Spent', value: spent }], fetchedAt: Date.now() };
          window.chrome.storage.local.set({ [`fan:${key}`]: { ...fan, stats } });
        }, 1200 + Math.random() * 1500);
      },
    },
    storage: {
      local: {
        get: async (key) => structuredClone(key === null ? store : key in store ? { [key]: store[key] } : {}),
        set: async (items) => {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: store[key], newValue: value };
            store[key] = structuredClone(value);
          }
          onChanged.listeners.forEach((fn) => fn(changes, 'local'));
        },
        remove: async (key) => {
          const changes = { [key]: { oldValue: store[key] } };
          delete store[key];
          onChanged.listeners.forEach((fn) => fn(changes, 'local'));
        },
      },
      onChanged,
    },
  };

  // Canned OpenRouter answers, after a short wait like a real model.
  if (params.get('ai') === 'fake') {
    const realFetch = window.fetch.bind(window);
    const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    const answer = (content) => json({ choices: [{ message: { content } }] });
    const typos = { teh: 'the', u: 'you', ur: 'your', realy: 'really', tommorow: 'tomorrow', wanna: 'want to', im: 'I’m', dont: 'don’t' };
    window.fetch = async (input, init) => {
      const url = String(input);
      if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (url.endsWith('/key')) return json({ data: { limit_remaining: 18.42 } });
      if (url.endsWith('/models')) {
        const model = (id, name, prompt, completion, moderated = false) => ({
          id, name, pricing: { prompt: String(prompt / 1e6), completion: String(completion / 1e6) },
          architecture: { output_modalities: ['text'] }, top_provider: { is_moderated: moderated },
          reasoning: { mandatory: false },
        });
        return json({
          data: [
            model('x-ai/grok-4.7', 'xAI: Grok 4.7', 0.2, 0.5),
            model('anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5', 3, 15, true),
            model('openai/gpt-5.2-mini', 'OpenAI: GPT-5.2 Mini', 0.25, 2, true),
            model('google/gemini-3-flash', 'Google: Gemini 3 Flash', 0.3, 2.5),
            model('meta-llama/llama-4-maverick', 'Meta: Llama 4 Maverick', 0.15, 0.6),
            model('mistralai/mistral-medium-3', 'Mistral: Mistral Medium 3', 0.4, 2),
            model('deepseek/deepseek-v3.2', 'DeepSeek: DeepSeek V3.2', 0, 0),
          ],
        });
      }
      const { model, messages } = JSON.parse(init.body);
      const [system, user] = messages.map((m) => m.content);
      if (model === 'openai/gpt-6-luna' && params.get('luna') === 'refuse') return answer('I’m sorry, but I can’t help with that.');
      if (system.startsWith('You help a content creator')) {
        return answer(
          messages.length > 2
            ? 'Already paid $25 for the red set, so $15 for new pics is an easy yes.\n<msg>i can’t resend that one babe 🙈 but i have 6 new pics from the same day nobody’s seen… $15 and they’re yours 😘</msg>'
            : '<msg>only 10 times? 😏 i might have something even better than the red one… want a peek?</msg>\n<msg>you’re making me blush 🙈 the red bikini was just the warm-up, babe</msg>\n<msg>aww stop 😍 i shot a few more that day, want me to send them on paypal?</msg>',
        );
      }
      if (system.startsWith('Fix the spelling')) {
        const fixed = user.replace(/[\p{L}’']+/gu, (w) => typos[w.toLowerCase()] ?? w).replace(/^\p{Ll}/u, (c) => c.toUpperCase());
        return answer(fixed);
      }
      return answer(
        [
          'Hey you 🙈 I just finished something special and honestly you’re the first person I thought of. Want to see?',
          'Okay, confession: I made something new today and I can’t stop thinking about who should see it first… you 😏',
          'Just wrapped a new set and I saved the best one for you. Tell me if you want a little preview 💕',
        ].join('\n---\n'),
      );
    };
  }

  window.nookNavigate = (url) => {
    activeUrl = url;
    onUpdated.listeners.forEach((fn) => fn(1, { url }, tab()));
  };

  window.nookType = (text) => {
    typed = text;
    report({ type: 'nook:draft', draft: draft() });
  };

  window.nookPressEnter = () => {
    const current = draft();
    if (current.matches.length) report({ type: 'nook:send-blocked', draft: current });
    else window.nookType('');
  };

  window.nookPageReport = (page) => {
    const info = { url: activeUrl, ...page };
    onMessage.listeners.forEach((fn) => fn({ type: 'nook:page', info }, { tab: tab() }));
  };
})();
