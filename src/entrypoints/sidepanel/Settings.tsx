import { type ReactNode, useEffect, useState } from 'react';
import { type AiModel, type AiSettings, chatLine, checkKey, listModels, saveAiSettings } from '@/lib/ai';
import { KEEP_TURNS } from '@/lib/aiChat';
import type { ChatLine } from '@/lib/page';
import { type Settings, type Theme, exportBackup, importBackup, updateSettings } from '@/lib/store';
import { isMac } from './chat';
import { downloadFile, pickFile, today } from './files';
import {
  BackIcon,
  BanIcon,
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  HistoryIcon,
  InsertIcon,
  KeyIcon,
  ModelIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  UploadIcon,
  UserIcon,
} from './icons';

export type Page = 'settings' | 'words' | 'ai-key' | 'ai-model' | 'ai-context';

const save = (mutate: (settings: Settings) => void) =>
  updateSettings(mutate).catch((error) => console.error('Nook: save failed', error));

function PageHead({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  return (
    <header className="page-head">
      <button className="icon-button" aria-label="Back" onClick={onBack}>
        <BackIcon />
      </button>
      <h1>{title}</h1>
      {children}
    </header>
  );
}

function Group({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="group">
      <h2 className="label">{label}</h2>
      <div className="group-box">{children}</div>
      {hint && <p className="hint">{hint}</p>}
    </section>
  );
}

function LinkRow({ icon, title, value, onClick }: { icon: ReactNode; title: string; value?: ReactNode; onClick: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      {icon}
      <span className="row-title">{title}</span>
      {value}
      <span className="row-chevron">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

// The label passes clicks on the whole row to the switch.
function SwitchRow({ icon, title, on, onChange }: { icon: ReactNode; title: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="row">
      {icon}
      <span className="row-title">{title}</span>
      <button className="switch" role="switch" aria-checked={on} onClick={() => onChange(!on)} />
    </label>
  );
}

interface SettingsProps {
  settings: Settings;
  ai: AiSettings | null;
  onOpen: (page: Page) => void;
  onBack: () => void;
}

export function SettingsPage({ settings, ai, onOpen, onBack }: SettingsProps) {
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const words = settings.customWords.length;

  const importFile = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const count = await importBackup(JSON.parse(await file.text()));
      setNote({ text: `Imported ${count} ${count === 1 ? 'fan' : 'fans'}, with templates and words.` });
    } catch (error) {
      setNote({ text: error instanceof SyntaxError ? 'Not a Nook backup file' : error instanceof Error ? error.message : String(error), error: true });
    }
  };

  return (
    <>
      <PageHead title="Settings" onBack={onBack} />
      <main className="page">
        <Group label="Protection" hint="Enter and Send do nothing while a restricted word is in the message.">
          <LinkRow
            icon={<BanIcon />}
            title="Restricted words"
            value={
              <span className="row-value">
                Built-in + {words} yours
              </span>
            }
            onClick={() => onOpen('words')}
          />
          <SwitchRow icon={<ShieldIcon />} title="Hold back sending" on={settings.holdBack} onChange={(on) => save((s) => void (s.holdBack = on))} />
        </Group>

        <Group
          label="Spending · OnlyFans"
          hint={
            settings.autoSpending
              ? 'Opening a chat opens the fan’s profile in a background tab, at most every 3 hours.'
              : 'Profiles open only when you press Look up on a fan, or Check spending in the chat list.'
          }
        >
          <SwitchRow
            icon={<RefreshIcon size={16} />}
            title="Look up spending on its own"
            on={settings.autoSpending}
            onChange={(on) => save((s) => void (s.autoSpending = on))}
          />
        </Group>

        <Group label="AI · OpenRouter" hint={`Off: Nook copies the text and you paste it with ${isMac ? '⌘V' : 'Ctrl+V'}.`}>
          <LinkRow
            icon={<KeyIcon />}
            title="API key"
            value={
              ai?.apiKey ? (
                <span className="row-value ok">
                  <CheckIcon size={13} />
                  Connected
                </span>
              ) : (
                <span className="row-value">Not set</span>
              )
            }
            onClick={() => onOpen('ai-key')}
          />
          <LinkRow icon={<ModelIcon />} title="Model" value={<span className="row-value">{ai?.modelName}</span>} onClick={() => onOpen('ai-model')} />
          <LinkRow icon={<EyeIcon />} title="What AI sees" onClick={() => onOpen('ai-context')} />
          <SwitchRow
            icon={<InsertIcon size={16} />}
            title="Insert into chat"
            on={settings.insertIntoChat}
            onChange={(on) => save((s) => void (s.insertIntoChat = on))}
          />
        </Group>

        <section className="group">
          <h2 className="label">Theme</h2>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as Theme[]).map((theme) => (
              <button key={theme} role="radio" aria-checked={settings.theme === theme} onClick={() => save((s) => void (s.theme = theme))}>
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <Group
          label="Your data"
          hint={
            note ? (
              <span className={note.error ? 'error' : 'notice'}>{note.text}</span>
            ) : (
              'Notes, templates and words live only in this browser. The AI key is never in a backup.'
            )
          }
        >
          <button
            className="row"
            onClick={async () => downloadFile(`nook-backup-${today()}.json`, JSON.stringify(await exportBackup(), null, 2), 'application/json')}
          >
            <DownloadIcon />
            <span className="row-title">Export backup</span>
          </button>
          <button className="row" onClick={importFile}>
            <UploadIcon />
            <span className="row-title">Import backup</span>
          </button>
        </Group>
      </main>
    </>
  );
}

// Where the creator's own OpenRouter key goes; it is checked with OpenRouter before saving.
export function AiKeyPage({ ai, onBack }: { ai: AiSettings | null; onBack: () => void }) {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<{ status: 'idle' | 'checking' | 'error' | 'saved'; message?: string }>({ status: 'idle' });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const submit = async () => {
    const apiKey = draft.trim();
    if (!apiKey || !ai) return;
    setState({ status: 'checking' });
    try {
      const { remaining } = await checkKey(apiKey);
      await saveAiSettings({ ...ai, apiKey });
      setDraft('');
      setState({ status: 'saved', message: remaining == null ? 'Connected.' : `Connected · $${remaining.toFixed(2)} left on this key.` });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <>
      <PageHead title="OpenRouter key" onBack={onBack} />
      <main className="page">
        <p className="hint">Spelling and Improve run on an AI model through OpenRouter, paid from your own OpenRouter account.</p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="stack">
            <span className="label">{ai?.apiKey ? 'Replace the key' : 'API key'}</span>
            <input
              className="field"
              type="password"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={ai?.apiKey ? `Saved: ${ai.apiKey.slice(0, 8)}…${ai.apiKey.slice(-4)}` : 'sk-or-v1-…'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="row-actions">
            <button className="btn primary grow" type="submit" disabled={!draft.trim() || state.status === 'checking'}>
              {state.status === 'checking' && <span className="spinner" />}
              {state.status === 'checking' ? 'Checking…' : 'Save'}
            </button>
            {ai?.apiKey && (
              <button
                type="button"
                className={confirming ? 'btn danger' : 'btn'}
                onClick={async () => {
                  if (!confirming) return setConfirming(true);
                  await saveAiSettings({ ...ai, apiKey: '' });
                  setConfirming(false);
                  setState({ status: 'idle' });
                }}
              >
                {confirming ? 'Click again to remove' : 'Remove key'}
              </button>
            )}
          </div>
        </form>
        {state.status === 'error' && <p className="error">{state.message}</p>}
        {state.status === 'saved' && (
          <p className="verdict">
            <CheckIcon />
            {state.message}
          </p>
        )}
        {state.status === 'idle' && ai?.apiKey && (
          <p className="verdict">
            <CheckIcon />
            Connected
          </p>
        )}
        <a className="text-link" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
          Get a key at openrouter.ai/keys
        </a>
        <p className="hint">
          The key stays in this browser and is never in a backup. Only the message text goes to the model, and only when you ask; nothing about the fan.
        </p>
      </main>
    </>
  );
}

const price = (perMillion: number) => (perMillion === 0 ? 'free' : `$${perMillion < 10 ? perMillion.toFixed(2) : perMillion.toFixed(0)}`);

// OpenRouter's models, to pick the one Spelling and Improve use.
export function ModelPage({ ai, onBack }: { ai: AiSettings | null; onBack: () => void }) {
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    listModels(controller.signal)
      .then(setModels)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [attempt]);

  const q = query.trim().toLowerCase();
  const shown = (models ?? []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));

  return (
    <>
      <PageHead title="Model" onBack={onBack} />
      <main className="page">
        <label className="search">
          <SearchIcon />
          <input autoFocus aria-label="Search models" placeholder="Search models" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <p className="hint">Prices per million tokens, in and out. A message is a few hundred. “Filters adult” models may refuse flirty texts.</p>
        {error && (
          <p className="error">
            {error}{' '}
            <button className="link" onClick={() => setAttempt(attempt + 1)}>
              Try again
            </button>
          </p>
        )}
        {!models && !error && <p className="hint">Loading models…</p>}
        {models && (
          <ul className="models" role="radiogroup" aria-label="Model">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  className="model"
                  role="radio"
                  aria-checked={ai?.model === m.id}
                  onClick={async () => {
                    if (!ai) return;
                    await saveAiSettings({ ...ai, model: m.id, modelName: m.name, effort: m.effort });
                    onBack();
                  }}
                >
                  <span className="grow">
                    <span className="model-name">{m.name}</span>
                    <span className="model-info">
                      {m.id} · {price(m.inputPrice)} / {price(m.outputPrice)}
                    </span>
                  </span>
                  {m.moderated && <span className="badge">Filters adult</span>}
                  {ai?.model === m.id && (
                    <span className="status accent">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              </li>
            ))}
            {!shown.length && <p className="empty-note">No model matches.</p>}
          </ul>
        )}
      </main>
    </>
  );
}

// A source of context for the AI, with a switch. The label passes clicks to the switch.
function SourceRow({
  icon,
  title,
  detail,
  on,
  onChange,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  on: boolean;
  onChange: (on: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <label className="row tall">
      {icon}
      <span className="row-title">
        {title}
        <span className="row-detail">{detail}</span>
        {children}
      </span>
      <button className="switch" role="switch" aria-checked={on} onClick={() => onChange(!on)} />
    </label>
  );
}

interface AiContextProps {
  settings: Settings;
  fanName: string; // empty when no chat is open
  thread: ChatLine[] | null;
  card: string[];
  onBack: () => void;
}

// What goes to the AI with each question in the AI tab, and how the creator writes.
export function AiContextPage({ settings, fanName, thread, card, onBack }: AiContextProps) {
  const [voice, setVoice] = useState(settings.voice);
  useEffect(() => {
    if (voice === settings.voice) return;
    const timer = setTimeout(() => save((s) => void (s.voice = voice)), 400);
    return () => clearTimeout(timer);
  }, [voice]);

  const latest = thread?.slice(-4) ?? [];
  return (
    <>
      <PageHead title="What AI sees" onBack={onBack} />
      <main className="page">
        <Group label={fanName ? `About ${fanName}, on every question` : 'On every question'} hint="Also what you’ve typed in the chat’s message box.">
          <SourceRow
            icon={<ChatIcon size={16} />}
            title="The conversation"
            detail={`${thread ? `${thread.length} ${thread.length === 1 ? 'message' : 'messages'}` : 'The messages'} loaded on the page. Scroll up in the chat to give it more.`}
            on={settings.aiSeesChat}
            onChange={(on) => save((s) => void (s.aiSeesChat = on))}
          >
            {settings.aiSeesChat && latest.length > 0 && (
              <span className="ai-preview">
                {latest.map((line, i) => (
                  <span key={i}>{chatLine({ ...line, time: undefined }, fanName || 'Fan').replace(/^Creator:/, 'You:')}</span>
                ))}
              </span>
            )}
          </SourceRow>
          <SourceRow
            icon={<UserIcon />}
            title="Their card"
            detail={card.length ? card.join(' · ') : 'Spent, subscription and lists, from their profile'}
            on={settings.aiSeesCard}
            onChange={(on) => save((s) => void (s.aiSeesCard = on))}
          />
          <SourceRow
            icon={<HistoryIcon />}
            title={`The last ${KEEP_TURNS} turns with AI`}
            detail="Kept on this computer for each fan. Older turns drop off."
            on={settings.aiRemembers}
            onChange={(on) => save((s) => void (s.aiRemembers = on))}
          />
        </Group>

        <section className="group">
          <h2 className="label">Your voice, for every fan</h2>
          <textarea
            className="field voice"
            aria-label="Your voice"
            placeholder="e.g. lowercase, lots of emojis, call them babe. never promise meetups. pics $15, videos $25+"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          />
        </section>

        <p className="hint">Sent with your OpenRouter key only when you ask. Nothing goes out in the background.</p>
      </main>
    </>
  );
}
