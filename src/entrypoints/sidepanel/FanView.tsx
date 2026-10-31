import { useEffect, useRef, useState } from 'react';
import { type Chat, PLATFORMS } from '@/lib/platforms';
import { STATS_MAX_AGE } from '@/lib/statsFetcher';
import { type Fan, type Note, type SavedStats, updateFan } from '@/lib/store';
import { Avatar } from './Avatar';
import { type PageFan, lookUpStats } from './hooks';
import { ListIcon, PlusIcon, SettingsIcon, SmallCloseIcon } from './icons';

interface FanViewProps {
  chat: Chat;
  fan: Fan | null; // null until something is saved for this chat
  page: PageFan | null;
  autoSpending: boolean; // false: the profile is read only when the creator asks
  onSettings: () => void;
}

export function FanView({ chat, fan, page, autoSpending, onSettings }: FanViewProps) {
  // A user edit to this fan. The record is created on the first edit.
  const edit = (mutate: (fan: Fan) => void) =>
    updateFan(chat, (f) => {
      if (page?.name) f.name = page.name;
      if (page?.username) f.username = page.username;
      mutate(f);
      f.updatedAt = Date.now();
    }).catch((error) => console.error('Nook: save failed', error));

  return (
    <>
      <FanHeader
        chat={chat}
        fan={fan}
        page={page}
        onSettings={onSettings}
        onRename={(alias) =>
          edit((f) => {
            f.alias = alias;
          })
        }
      />
      <Profile
        chat={chat}
        stats={fan?.stats}
        onLookUp={autoSpending || chat.platform !== 'onlyfans' ? undefined : () => lookUpStats(chat, page?.username || fan?.username || '')}
      />
      <Notes
        chatKey={chat.key}
        notes={fan?.notes ?? []}
        onAdd={(text) => edit((f) => f.notes.push({ id: crypto.randomUUID(), text, createdAt: Date.now() }))}
        onChange={(id, text) =>
          edit((f) => {
            const note = f.notes.find((n) => n.id === id);
            if (note) Object.assign(note, { text, updatedAt: Date.now() });
          })
        }
        onDelete={(id) =>
          edit((f) => {
            f.notes = f.notes.filter((note) => note.id !== id);
          })
        }
        onRestore={(note) =>
          edit((f) => {
            if (!f.notes.some((n) => n.id === note.id)) f.notes.push(note);
          })
        }
      />
    </>
  );
}

function FanHeader({ chat, fan, page, onSettings, onRename }: Omit<FanViewProps, 'autoSpending'> & { onRename: (alias: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // set while renaming
  const finished = useRef(false); // the input can still blur after Enter/Escape
  const username = page?.username || fan?.username || '';
  const siteName = page?.name || fan?.name || '';
  const name = fan?.alias || siteName || (username ? `@${username}` : `Fan ${chat.chatId}`);

  const startRename = () => {
    finished.current = false;
    setDraft(fan?.alias ?? '');
  };
  const commit = () => {
    if (draft == null || finished.current) return;
    finished.current = true;
    const alias = draft.trim();
    setDraft(null);
    if (alias !== (fan?.alias ?? '')) onRename(alias);
  };
  const cancel = () => {
    finished.current = true;
    setDraft(null);
  };

  const meta = [username && name !== `@${username}` && `@${username}`, fan?.alias && siteName, PLATFORMS[chat.platform].label]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className="fan-header">
      <Avatar name={name} seed={chat.key} />
      <div className="fan-title">
        {draft == null ? (
          <button className="fan-name" title="Rename" onClick={startRename}>
            {name}
          </button>
        ) : (
          <input
            className="alias-input"
            autoFocus
            aria-label="Your name for this fan"
            placeholder={siteName || 'Your name for this fan'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
            onBlur={commit}
          />
        )}
        <p className="fan-meta">{meta}</p>
      </div>
      <button className="icon-button" aria-label="Settings" title="Settings" onClick={onSettings}>
        <SettingsIcon />
      </button>
    </header>
  );
}

// What the site last showed about the fan: OnlyFans' "Fan statistics" and the creator's
// lists the fan is on (read from the profile on its own, or when the creator asks with
// `onLookUp`), or Fansly's Earnings window (read when the creator opens it).
function Profile({ chat, stats, onLookUp }: { chat: Chat; stats?: SavedStats; onLookUp?: () => void }) {
  const [asked, setAsked] = useState(false);
  useEffect(() => setAsked(false), [stats?.fetchedAt]); // the answer came
  const lookUp = onLookUp && (!stats || Date.now() - stats.fetchedAt > STATS_MAX_AGE) && (
    <>
      {' · '}
      {asked ? (
        'opening their profile…'
      ) : (
        <button
          className="link accent"
          title="Opens their profile in a background tab and reads it"
          onClick={() => {
            setAsked(true);
            onLookUp();
          }}
        >
          Look up
        </button>
      )}
    </>
  );

  if (!stats) {
    if (chat.platform === 'fansly') return <p className="source">Spending: open ⋯ → Earnings → Lifetime in this chat, and Nook keeps the numbers.</p>;
    return lookUp ? <p className="source">Spending not looked up{lookUp}</p> : null;
  }

  const lists = stats.lists ?? [];
  // OnlyFans said the account is gone; numbers read before that stay.
  const gone = stats.missing && (
    <p className="source">
      Their profile isn’t available now: deleted or banned · checked {timeAgo(stats.fetchedAt)}
      {lookUp}
    </p>
  );
  if (gone && !stats.items.length && !lists.length) return gone;
  const source =
    chat.platform === 'fansly'
      ? `From Earnings${stats.period ? ` (${stats.period})` : ''}`
      : lists.length
        ? 'Spending and lists from their profile'
        : 'From their profile';
  return (
    <>
      <section className="profile" aria-label="From the site">
        <dl className={stats.items.length > 2 ? 'metrics compact' : 'metrics'}>
          {stats.items.map(({ label, value }) => (
            <div key={label}>
              <dt>{label.charAt(0).toUpperCase() + label.slice(1)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {lists.length > 0 && (
          <div className="lists" aria-label="Lists they are on">
            <ListIcon />
            {lists.map((list) => (
              <span className="list-chip" key={list}>
                {list}
              </span>
            ))}
          </div>
        )}
      </section>
      {gone || (
        <p className="source">
          {source} · {timeAgo(stats.fetchedAt)}
          {lookUp}
        </p>
      )}
    </>
  );
}

function timeAgo(timestamp: number) {
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  return format.format(-Math.round(hours / 24), 'day');
}

// Unsaved note text per fan, kept while hopping between chats.
const drafts = new Map<string, string>();

interface NotesProps {
  chatKey: string;
  notes: Note[];
  onAdd: (text: string) => void;
  onChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onRestore: (note: Note) => void;
}

// Notes read like a notepad: oldest first, one note per line (a note can run over several
// lines), each edited where it is. Enter moves on to a new note at the bottom; a note emptied
// out is deleted, with a moment to undo.
function Notes({ chatKey, notes, onAdd, onChange, onDelete, onRestore }: NotesProps) {
  const [draft, setDraftState] = useState(() => drafts.get(chatKey) ?? '');
  const [deleted, setDeleted] = useState<Note | null>(null);
  const addRef = useRef<HTMLTextAreaElement>(null);
  const ordered = [...notes].sort((a, b) => a.createdAt - b.createdAt);

  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), 6000);
    return () => clearTimeout(timer);
  }, [deleted]);

  const setDraft = (text: string) => {
    setDraftState(text);
    if (text) drafts.set(chatKey, text);
    else drafts.delete(chatKey);
  };
  const save = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onAdd(text);
  };
  const remove = (note: Note) => {
    onDelete(note.id);
    setDeleted(note);
  };

  return (
    <section className="notes" aria-label="Notes">
      <div className="notes-head">
        <h3 className="label">Notes</h3>
        {notes.length > 0 && <span className="count">{notes.length}</span>}
      </div>
      <div className="note-lines">
        {ordered.map((note) => (
          <NoteLine
            key={note.id}
            note={note}
            onChange={(text) => onChange(note.id, text)}
            onRemove={() => remove(note)}
            onNext={() => addRef.current?.focus()}
          />
        ))}
        <label className="note-new">
          <PlusIcon />
          <textarea
            ref={addRef}
            rows={1}
            aria-label="Add a note"
            placeholder="Add a note"
            title="Enter to save, Shift+Enter for a new line"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
            }}
          />
        </label>
      </div>
      {deleted && (
        <p className="toast">
          Note deleted
          <button
            className="toast-action"
            onClick={() => {
              onRestore(deleted);
              setDeleted(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
    </section>
  );
}

// One note, editable where it is. It saves as you type; emptied and left, it's deleted.
function NoteLine({ note, onChange, onRemove, onNext }: { note: Note; onChange: (text: string) => void; onRemove: () => void; onNext: () => void }) {
  const [text, setText] = useState(note.text);
  const focused = useRef(false);

  // A change from elsewhere (a backup imported, the same fan in another window) shows up
  // unless this note is being edited.
  useEffect(() => {
    if (!focused.current) setText(note.text);
  }, [note.text]);

  // Saved a moment after typing stops, and when leaving the note.
  useEffect(() => {
    if (text.trim() === note.text || !text.trim()) return;
    const timer = setTimeout(() => onChange(text.trim()), 500);
    return () => clearTimeout(timer);
  }, [text]);

  const finish = () => {
    focused.current = false;
    if (!text.trim()) onRemove();
    else if (text.trim() !== note.text) onChange(text.trim());
  };

  const edited = note.updatedAt && note.updatedAt - note.createdAt > 60_000 ? ` · edited ${formatDate(note.updatedAt)}` : '';
  return (
    <div className="note-line">
      <textarea
        className="note-edit"
        rows={1}
        aria-label="Note"
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={finish}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onNext();
          }
          if (e.key === 'Backspace' && !text) {
            e.preventDefault();
            onNext();
          }
          if (e.key === 'Escape') {
            setText(note.text);
            e.currentTarget.blur();
          }
        }}
      />
      <time className="note-date" dateTime={new Date(note.createdAt).toISOString()} title={`Added ${formatDate(note.createdAt)}${edited}`}>
        {formatDay(note.createdAt)}
      </time>
      <button className="note-remove" aria-label="Delete this note" title="Delete" onMouseDown={(e) => e.preventDefault()} onClick={onRemove}>
        <SmallCloseIcon size={10} />
      </button>
    </div>
  );
}

const formatDay = (timestamp: number) => new Date(timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' });

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  // In English like the rest of the panel; the clock follows the computer's 12/24-hour setting.
  const day = date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}
