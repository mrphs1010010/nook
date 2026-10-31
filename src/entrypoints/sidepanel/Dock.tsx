import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { type AiSettings, SPELLING_MODEL, fixSpelling } from '@/lib/ai';
import { diffWords } from '@/lib/diff';
import type { Draft } from '@/lib/messages';
import { type Settings, updateSettings } from '@/lib/store';
import { type Delivery, copyText, deliveryNote, isMac, sendToChat } from './chat';
import { Highlighted } from './Highlighted';
import {
  BanIcon,
  CloseIcon,
  CopyIcon,
  ImproveIcon,
  InsertIcon,
  RefreshIcon,
  ShieldIcon,
  ShieldOffIcon,
  SpellingIcon,
  TemplatesIcon,
} from './icons';
import { ImproveSheet } from './Improve';
import { TemplatesSheet } from './Templates';
import { type WordCheck, marksOf } from './words';

interface DockProps {
  tabId: number | null;
  draft: Draft | null; // what is typed in the tab's message box
  blockedAt: number; // when sending that text was last held back, else 0
  missing: boolean; // Nook's script isn't running in the tab, so nothing is read or guarded
  chatOpen: boolean;
  settings: Settings;
  check: WordCheck;
  ai: AiSettings | null;
  fanName: string;
  onNeedKey: () => void;
}

interface Spelling {
  original: string; // the text it was checked for
  status: 'loading' | 'done' | 'error';
  result?: string;
  checkedBy?: string; // the model that checked it, when the cheap one refused
  error?: string;
}

const REWRITE = 'Remove the restricted words and keep everything else.';

// The bottom of the panel: everything about the message being typed. It shows a copy of
// the text with restricted words in red, and holds the tools for writing it.
export function Dock({ tabId, draft, blockedAt, missing, chatOpen, settings, check, ai, fanName, onNeedKey }: DockProps) {
  const [sheet, setSheet] = useState<null | { kind: 'templates' } | { kind: 'improve'; instruction: string; autoRun: boolean }>(null);
  const [spelling, setSpelling] = useState<Spelling | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(''), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  const text = draft?.text ?? '';
  const boxFound = Boolean(draft?.inputFound);
  const insert = settings.insertIntoChat && boxFound;
  // A spelling check belongs to the text it was made for; typing on drops it.
  const fix = spelling?.original === text ? spelling : null;

  const deliver = async (value: string, replace: boolean): Promise<Delivery> => {
    const delivery = await sendToChat(value, { tabId, insert, replace });
    setNote(deliveryNote(delivery));
    return delivery;
  };

  const checkSpelling = async () => {
    if (!ai?.apiKey) return onNeedKey();
    setShowOriginal(false);
    setSpelling({ original: text, status: 'loading' });
    try {
      const { text: result, model, fallback } = await fixSpelling(text, { ai });
      setSpelling((s) => (s?.original === text ? { original: text, status: 'done', result, ...(fallback && { checkedBy: model }) } : s));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSpelling((s) => (s?.original === text ? { original: text, status: 'error', error: message } : s));
    }
  };

  const openTemplates = () => setSheet({ kind: 'templates' });
  const openImprove = (instruction = '', autoRun = false) => setSheet({ kind: 'improve', instruction, autoRun });

  const sheets = sheet && (
    <>
      {sheet.kind === 'templates' && (
        <TemplatesSheet
          templates={settings.templates}
          check={check}
          fanName={fanName}
          insert={insert}
          onDeliver={async (template, value) => {
            const delivery = await deliver(value, false);
            if (delivery !== 'failed') {
              updateSettings((s) => {
                const t = s.templates.find((x) => x.id === template.id);
                if (t) t.uses++;
              }).catch((error) => console.error('Nook: save failed', error));
              setSheet(null);
            }
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet.kind === 'improve' && (
        <ImproveSheet
          draft={text}
          instruction={sheet.instruction}
          autoRun={sheet.autoRun}
          ai={ai}
          check={check}
          insert={insert}
          onDeliver={async (value) => {
            const delivery = await deliver(value, true);
            if (delivery !== 'failed') setSheet(null);
            return delivery;
          }}
          onNeedKey={() => {
            setSheet(null);
            onNeedKey();
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );

  const templatesButton = (
    <button className="btn soft small" onClick={openTemplates}>
      <TemplatesIcon />
      Templates
    </button>
  );

  // A tab Nook's script couldn't get into: the site page has to be reloaded.
  if (missing) {
    return (
      <>
        <footer className="dock bar">
          <span className="status danger" title="Nothing you type here is checked until the page reloads.">
            <ShieldOffIcon />
            Reload the page to turn Nook on
          </span>
          <button className="btn soft small" onClick={() => tabId != null && browser.tabs.reload(tabId).catch(() => {})}>
            <RefreshIcon size={14} />
            Reload
          </button>
        </footer>
        {sheets}
      </>
    );
  }

  // No message box to watch: a chat whose box can't be found, or a page that isn't a chat.
  if (!boxFound) {
    return (
      <>
        <footer className="dock bar">
          {chatOpen && draft ? (
            <span className="status danger" title="The site may have changed. Restricted words aren’t checked here.">
              <ShieldOffIcon />
              Can’t find the message box
            </span>
          ) : (
            <span className="status">{chatOpen ? '' : 'Templates work here too'}</span>
          )}
          {templatesButton}
        </footer>
        {note && <p className="toast">{note}</p>}
        {sheets}
      </>
    );
  }

  let body;
  if (fix && fix.status !== 'loading' && fix.status !== 'error') {
    const changes = diffWords(fix.original, fix.result ?? '');
    const fixes = changes.filter((c) => c.kind === 'added').length || changes.filter((c) => c.kind === 'removed').length;
    body = (
      <section className="dock" aria-label="Spelling">
        <div className="dock-head">
          <span className="status title accent">
            <SpellingIcon />
            {fixes ? `Spelling · ${fixes} ${fixes === 1 ? 'fix' : 'fixes'}` : 'No mistakes found'}
          </span>
          {fixes > 0 && (
            <button className="link" onClick={() => setShowOriginal(!showOriginal)}>
              {showOriginal ? 'Show fixes' : 'Show original'}
            </button>
          )}
        </div>
        <p className="mirror">
          {showOriginal
            ? fix.original
            : changes.map((change, i) =>
                change.kind === 'same' ? (
                  change.text
                ) : (
                  <mark key={i} className={change.kind}>
                    {change.text}
                  </mark>
                ),
              )}
        </p>
        {fix.checkedBy && <p className="hint tiny">
            {SPELLING_MODEL.name} couldn’t, so {fix.checkedBy} checked it.
          </p>}
        {fixes > 0 ? (
          <>
            <p className="hint">
              {insert
                ? `Replaces your message in the chat. ${isMac ? '⌘Z' : 'Ctrl+Z'} there brings it back.`
                : 'Copy it, then paste it over your message in the chat.'}
            </p>
            <div className="row-actions">
              <button className="btn primary grow" onClick={() => deliver(fix.result ?? '', true)}>
                {insert ? <InsertIcon /> : <CopyIcon />}
                {insert ? 'Insert in chat' : 'Copy'}
              </button>
              {insert && (
                <button className="btn" onClick={async () => setNote(deliveryNote((await copyText(fix.result ?? '')) ? 'copied' : 'failed'))}>
                  <CopyIcon />
                  Copy
                </button>
              )}
              <button className="btn square" aria-label="Discard" title="Discard" onClick={() => setSpelling(null)}>
                <CloseIcon />
              </button>
            </div>
          </>
        ) : (
          <div className="row-actions">
            <button className="btn grow" onClick={() => setSpelling(null)}>
              OK
            </button>
          </div>
        )}
      </section>
    );
  } else if (!text.trim()) {
    body = (
      <footer className="dock bar">
        {settings.holdBack ? (
          <span className="status">
            <span className="status ok">
              <ShieldIcon />
            </span>
            Checking what you type
          </span>
        ) : (
          <span className="status">Restricted words are only highlighted</span>
        )}
        {templatesButton}
      </footer>
    );
  } else if (draft!.matches.length) {
    const count = draft!.matches.length;
    body = (
      <section className="dock danger" aria-label="Your message">
        <div className="dock-head">
          <span key={blockedAt} className={blockedAt ? 'status title danger blocked' : 'status title danger'} role="status">
            <BanIcon />
            {blockedAt ? 'Not sent' : settings.holdBack ? 'Won’t send' : 'Restricted words'}
          </span>
          <span className="pill">
            {count} restricted {count === 1 ? 'word' : 'words'}
          </span>
        </div>
        <p className="mirror">
          <Highlighted text={text} marks={marksOf(draft!.matches)} />
        </p>
        <p className="hint">Delete the red words in the chat, or let AI rewrite it without them.</p>
        <div className="row-actions">
          <button className="btn primary grow" onClick={() => openImprove(REWRITE, true)}>
            <ImproveIcon />
            Rewrite without them
          </button>
          <button className="btn square" aria-label="Templates" title="Templates" onClick={openTemplates}>
            <TemplatesIcon />
          </button>
        </div>
      </section>
    );
  } else {
    body = (
      <section className="dock" aria-label="Your message">
        <div className="dock-head">
          <h3 className="label">Your message</h3>
          <span className="status ok">
            <ShieldIcon />
            Clean
          </span>
        </div>
        <p className="mirror">{text}</p>
        {fix?.status === 'error' && <p className="error">{fix.error}</p>}
        <div className="actions">
          <button className="btn" disabled={fix?.status === 'loading'} onClick={checkSpelling}>
            {fix?.status === 'loading' ? <span className="spinner" /> : <SpellingIcon />}
            Spelling
          </button>
          <button className="btn" onClick={() => openImprove()}>
            <ImproveIcon />
            Improve
          </button>
          <button className="btn" onClick={openTemplates}>
            <TemplatesIcon />
            Templates
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      {body}
      {note && <p className="toast">{note}</p>}
      {sheets}
    </>
  );
}
