import { useEffect, useMemo, useState } from 'react';
import { PLATFORMS, type PlatformId } from '@/lib/platforms';
import { splitWords, wordMatcher } from '@/lib/restricted';
import { type Settings, updateSettings } from '@/lib/store';
import { BUILT_IN, rulesFor } from '@/lib/wordLists';
import { downloadFile, pickFile } from './files';
import { Highlighted } from './Highlighted';
import { BackIcon, BanIcon, CheckIcon, ChevronRightIcon, DownloadIcon, SearchIcon, SmallCloseIcon, UploadIcon } from './icons';
import { marksOf } from './words';

interface WordsProps {
  settings: Settings;
  platform: PlatformId; // the site of the open tab, shown first
  onBack: () => void;
}

type Tab = 'yours' | 'built-in' | 'allowed';

// What a message is checked against: the creator's own words, the built-in list, and the
// words they allow anyway, everywhere or on one site.
export function WordsSettings({ settings, platform, onBack }: WordsProps) {
  const [tab, setTab] = useState<Tab>('yours');
  const [site, setSite] = useState<PlatformId>(platform);
  const allowed = settings.allowedWords.length + Object.values(settings.allowedOn).flat().length;

  return (
    <>
      <header className="page-head">
        <button className="icon-button" aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Restricted words</h1>
      </header>
      <main className="page">
        <div className="segmented" role="tablist" aria-label="Lists">
          <button role="tab" aria-selected={tab === 'yours'} onClick={() => setTab('yours')}>
            Yours <span className="tab-count">{settings.customWords.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'built-in'} onClick={() => setTab('built-in')}>
            Built-in <span className="tab-count">{BUILT_IN.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'allowed'} onClick={() => setTab('allowed')}>
            Allowed <span className="tab-count">{allowed}</span>
          </button>
        </div>

        {tab === 'yours' && (
          <WordList
            words={settings.customWords}
            field="customWords"
            hint="Held back on every site."
            empty="Your list is empty. The built-in lists still apply."
            file="nook-my-words.txt"
          />
        )}
        {tab === 'allowed' && <AllowedList settings={settings} />}
        {tab === 'built-in' && <BuiltIn settings={settings} />}

        <TryMessage settings={settings} site={site} onSite={setSite} />
      </main>
    </>
  );
}

// Where a word is allowed: everywhere, or on one site.
type Scope = 'all' | PlatformId;

const SCOPES: Scope[] = ['all', ...(Object.keys(PLATFORMS) as PlatformId[])];
const scopeLabel = (scope: Scope) => (scope === 'all' ? 'Everywhere' : PLATFORMS[scope].label);

function scopesOf(settings: Settings, word: string): Scope[] {
  const has = (list: string[] = []) => list.some((w) => w.toLowerCase() === word.toLowerCase());
  return SCOPES.filter((scope) => has(scope === 'all' ? settings.allowedWords : settings.allowedOn[scope]));
}

function setAllowed(word: string, scope: Scope, on: boolean) {
  return updateSettings((s) => {
    const list = scope === 'all' ? s.allowedWords : (s.allowedOn[scope] ??= []);
    const rest = list.filter((w) => w.toLowerCase() !== word.toLowerCase());
    const next = on ? [...rest, word] : rest;
    if (scope === 'all') s.allowedWords = next;
    else s.allowedOn[scope] = next;
  }).catch((error) => console.error('Nook: save failed', error));
}

// The built-in list, A to Z. It isn't edited: pick a word to allow it everywhere or on one site.
function BuiltIn({ settings }: { settings: Settings }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const scopes = picked ? scopesOf(settings, picked) : [];
  const shown = BUILT_IN.filter((w) => !q || w.toLowerCase().includes(q));

  return (
    <>
      <p className="hint">Words that often get messages flagged, held back like your own. Tap one to allow it everywhere or on one site.</p>
      <div className="words-tools search-only">
        <SearchIcon />
        <input aria-label="Search the built-in list" placeholder={`Search ${BUILT_IN.length} words`} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {picked && (
        <div className="allow-bar" role="group" aria-label={`Allow ${picked}`}>
          <span className="allow-word">“{picked}”</span>
          <span className="hint tiny">Allow on</span>
          {SCOPES.map((scope) => (
            <button key={scope} className="chip-toggle" role="switch" aria-checked={scopes.includes(scope)} onClick={() => setAllowed(picked, scope, !scopes.includes(scope))}>
              {scopes.includes(scope) && <CheckIcon size={12} />}
              {scopeLabel(scope)}
            </button>
          ))}
        </div>
      )}
      <div className="words">
        {shown.length ? (
          <div className="word-grid">
            {shown.map((word) => {
              const allowedOn = scopesOf(settings, word);
              return (
                <button
                  key={word}
                  className={`word readonly ${allowedOn.length ? 'is-allowed' : ''} ${picked === word ? 'picked' : ''}`}
                  title={allowedOn.length ? `Allowed: ${allowedOn.map(scopeLabel).join(', ')}` : 'Allow this word'}
                  onClick={() => setPicked(picked === word ? null : word)}
                >
                  {word}
                  {allowedOn.length > 0 && <span className="word-scope">{allowedOn.map((s) => (s === 'all' ? 'all' : PLATFORMS[s].label[0])).join('')}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="empty-note">No word matches.</p>
        )}
        {shown.length > 0 && <div className="words-foot">{q ? `${shown.length} of ${BUILT_IN.length}` : 'A to Z'}</div>}
      </div>
    </>
  );
}

// The allowed words, everywhere or on one site.
function AllowedList({ settings }: { settings: Settings }) {
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const entries = SCOPES.flatMap((s) => (s === 'all' ? settings.allowedWords : (settings.allowedOn[s] ?? [])).map((word) => ({ word, scope: s })));

  return (
    <>
      <p className="hint">Never flagged, even when a list has them or a * entry covers them. Put your own @names here, or a word that’s fine on one site.</p>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          for (const word of splitWords(draft)) setAllowed(word, scope, true);
          setDraft('');
        }}
      >
        <input className="field" aria-label="Add words to allow" placeholder="e.g. @yourname" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!draft.trim()}>
          Allow
        </button>
      </form>
      <div className="segmented" role="radiogroup" aria-label="Where">
        {SCOPES.map((s) => (
          <button key={s} role="radio" aria-checked={scope === s} onClick={() => setScope(s)}>
            {s === 'all' ? 'Everywhere' : `${PLATFORMS[s].label} only`}
          </button>
        ))}
      </div>
      <div className="words">
        {entries.length ? (
          <div className="word-grid">
            {entries.map(({ word, scope: s }) => (
              <span className="word allowed" key={`${s}:${word}`}>
                {word}
                {s !== 'all' && <span className="word-scope">{PLATFORMS[s].label}</span>}
                <button aria-label={`Stop allowing ${word}`} title="Remove" onClick={() => setAllowed(word, s, false)}>
                  <SmallCloseIcon size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="empty-note">Nothing allowed yet.</p>
        )}
      </div>
    </>
  );
}

// The creator's own words, editable.
function WordList({ words, field, hint, empty, file }: { words: string[]; field: 'customWords'; hint: string; empty: string; file: string }) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(''), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  const add = async (entries: string[]) => {
    if (!entries.length) return;
    let added = 0;
    try {
      await updateSettings((s) => {
        const seen = new Set(s[field].map((w) => w.toLowerCase()));
        for (const word of entries) {
          if (seen.has(word.toLowerCase())) continue;
          seen.add(word.toLowerCase());
          s[field].push(word);
          added++;
        }
        if (!added) return false;
      });
    } catch (error) {
      console.error('Nook: save failed', error);
      return setNote('Couldn’t save the words.');
    }
    if (!added) setNote(entries.length === 1 ? 'Already on the list.' : 'All of them are already on the list.');
    else if (entries.length > 1) setNote(`Added ${added} ${added === 1 ? 'word' : 'words'}${added < entries.length ? `, ${entries.length - added} already there` : ''}.`);
  };
  const remove = (word: string) =>
    updateSettings((s) => {
      s[field] = s[field].filter((w) => w !== word);
    }).catch((error) => console.error('Nook: save failed', error));

  const importList = async () => {
    const picked = await pickFile('.txt,.csv,text/plain,text/csv');
    if (picked) add(splitWords(await picked.text()));
  };

  const q = query.trim().toLowerCase();
  const shown = [...words].reverse().filter((word) => !q || word.toLowerCase().includes(q)); // newest first
  return (
    <>
      <p className="hint">{hint}</p>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add(splitWords(draft));
          setDraft('');
        }}
      >
        <textarea
          className="field"
          rows={1}
          aria-label="Add words"
          placeholder="Add words, or paste a whole list"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="btn primary" type="submit" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      {note && <p className="notice">{note}</p>}

      <div className="words">
        <div className="words-tools">
          <SearchIcon />
          <input aria-label="Search words" placeholder={`Search ${words.length} words`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="icon-button small" aria-label="Import a list" title="Import a list (.txt or .csv)" onClick={importList}>
            <UploadIcon size={15} />
          </button>
          <button
            className="icon-button small"
            aria-label="Export the list"
            title="Export the list"
            disabled={!words.length}
            onClick={() => downloadFile(file, `${words.join('\n')}\n`, 'text/plain')}
          >
            <DownloadIcon size={15} />
          </button>
        </div>
        {shown.length > 0 ? (
          <div className="word-grid">
            {shown.map((word) => (
              <span className="word" key={word}>
                {word}
                <button aria-label={`Remove ${word}`} title="Remove" onClick={() => remove(word)}>
                  <SmallCloseIcon size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="empty-note">{words.length ? 'No word matches.' : empty}</p>
        )}
        {shown.length > 0 && <div className="words-foot">{q ? `${shown.length} of ${words.length}` : 'Newest first'}</div>}
      </div>
    </>
  );
}

// A message checked against everything that's on for a site.
function TryMessage({ settings, site, onSite }: { settings: Settings; site: PlatformId; onSite: (site: PlatformId) => void }) {
  const [sample, setSample] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const find = useMemo(() => wordMatcher(rulesFor(settings, site)), [settings, site]);
  const matches = find(sample);
  const words = [...new Set(matches.map((m) => m.word))].join(', ');

  return (
    <>
      <section className="stack">
        <div className="try-head">
          <h2 className="label">Try a message</h2>
          <span className="try-site">
            {(Object.keys(PLATFORMS) as PlatformId[]).map((id) => (
              <button key={id} className={id === site ? 'link accent' : 'link'} onClick={() => onSite(id)}>
                {PLATFORMS[id].label}
              </button>
            ))}
          </span>
        </div>
        <div className="try">
          <textarea rows={1} aria-label="Message to try" placeholder="Type a message to test the words" value={sample} onChange={(e) => setSample(e.target.value)} />
          {sample.trim() && (
            <>
              {matches.length > 0 && (
                <p className="mirror">
                  <Highlighted text={sample} marks={marksOf(matches)} />
                </p>
              )}
              <p className={matches.length ? 'verdict danger' : 'verdict'}>
                {matches.length ? <BanIcon size={14} /> : <CheckIcon />}
                {matches.length ? `${settings.holdBack ? 'Would be held back' : 'Would be flagged'}: ${words}` : 'Would send fine'}
              </p>
            </>
          )}
        </div>
      </section>

      <div className="stack">
        <button className="disclosure" aria-expanded={rulesOpen} onClick={() => setRulesOpen(!rulesOpen)}>
          <ChevronRightIcon size={14} />
          How matching works: whole words, disguises caught, * for part of a word
        </button>
        {rulesOpen && (
          <ul className="rules">
            <li>
              Whole words only: <b>ass</b> won’t catch “class”.
            </li>
            <li>Disguises are caught: p.a.y.p.a.l, pay pal, p@yp4l, look-alike letters.</li>
            <li>
              Add * for part of a word: <b>pay*</b> catches “payment”.
            </li>
            <li>An allowed word wins: allow <b>@yourname</b>, and <b>@*</b> leaves it alone.</li>
            <li>Commas or new lines separate words when you paste a list.</li>
          </ul>
        )}
      </div>
    </>
  );
}
