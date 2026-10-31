import { useEffect, useMemo, useRef, useState } from 'react';
import { type AiSettings, type AiTurn, askAi, parseAnswer } from '@/lib/ai';
import { KEEP_TURNS, addTurn, clearTurns, getTurns, onTurnsChanged } from '@/lib/aiChat';
import type { ChatLine } from '@/lib/page';
import type { Match } from '@/lib/restricted';
import { type Settings, updateSettings } from '@/lib/store';
import { copyText, deliveryNote, sendToChat } from './chat';
import { Highlighted } from './Highlighted';
import { readThreadNow } from './hooks';
import { type WordCheck, marksOf } from './words';
import { BanIcon, CheckIcon, ChevronRightIcon, CopyIcon, EyeIcon, HistoryIcon, InsertIcon, SendIcon, ShieldIcon, SparkIcon } from './icons';

interface AiChatProps {
  fanKey: string;
  fanName: string; // first name, as the site shows it
  card: string[]; // the fan's card, line by line, for the AI
  tabId: number | null;
  thread: ChatLine[] | null; // the chat on the page, as last reported
  draft: string; // what is typed in the chat's message box
  restricted: number; // restricted words in it
  insert: boolean; // whether Nook may type into the chat, else it copies
  missing: boolean; // Nook's script isn't in the tab, so the chat can't be read
  settings: Settings;
  check: WordCheck;
  ai: AiSettings | null;
  onNeedKey: () => void;
  onShowContext: () => void;
  onShowFan: () => void;
}

// The creator's chat with the AI about the open fan. Each question goes with what the
// creator lets it see (the chat on the page, the fan's card) and the last turns about this fan.
export function AiChat(props: AiChatProps) {
  const { fanKey, fanName, card, tabId, thread, draft, restricted, insert, missing, settings, check, ai, onNeedKey, onShowContext, onShowFan } = props;
  const [turns, setTurns] = useTurns(fanKey);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<{ ask: string; error?: string } | null>(null);
  const [note, setNote] = useState('');
  const mounted = useRef(true);
  const findRestricted = check.find;

  useEffect(
    () => () => {
      mounted.current = false; // an answer that comes back later is still saved for this fan
    },
    [],
  );
  // The panel scrolls as a whole, under the composer stuck to its bottom: go to the very end.
  useEffect(() => {
    const page = document.scrollingElement;
    page?.scrollTo({ top: page.scrollHeight }); // returns a promise in newer Chrome, which must not be the cleanup
  }, [turns.length, pending]);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(''), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  const loading = Boolean(pending && !pending.error);

  const send = async (question: string) => {
    const ask = question.trim();
    if (!ask || loading) return;
    if (!ai?.apiKey) return onNeedKey();
    setPending({ ask });
    setInput('');
    try {
      // The chat as it is now: the fan may have written since the panel last heard.
      const lines = settings.aiSeesChat ? ((await readThreadNow(tabId)) ?? thread) : null;
      const answer = await askAi(
        ask,
        {
          fanName,
          thread: lines,
          card: settings.aiSeesCard ? card : [],
          draft,
          history: settings.aiRemembers ? turns : [],
          voice: settings.voice,
          restrictedWords: check.avoidWords,
          restrictedTopics: check.avoidTopics,
        },
        { ai },
      );
      const turn: AiTurn = { ask, answer, model: ai.modelName, at: Date.now() };
      await addTurn(fanKey, turn);
      if (mounted.current) {
        setTurns((t) => (t.some((x) => x.at === turn.at) ? t : [...t, turn].slice(-KEEP_TURNS))); // storage may have told us already
        setPending(null);
      }
    } catch (error) {
      if (mounted.current) setPending({ ask, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const deliver = async (text: string) => setNote(deliveryNote(await sendToChat(text, { tabId, insert, replace: true })));

  const sees = [
    settings.aiSeesChat && (missing ? 'not the chat: reload the page' : thread ? `${thread.length} ${thread.length === 1 ? 'message' : 'messages'}` : 'the chat'),
    settings.aiSeesCard && card.length > 0 && 'spent, lists',
  ].filter(Boolean);

  return (
    <>
      <button className="ai-context-line" onClick={onShowContext}>
        <EyeIcon size={13} />
        <span>{sees.length ? `Sees ${sees.join(' · ')}` : 'Sees only your question'}</span>
        <ChevronRightIcon size={12} />
      </button>

      <main className="ai-thread" aria-live="polite">
        {turns.length > 0 ? (
          <div className="ai-memory">
            <HistoryIcon size={12} />
            <span>{settings.aiRemembers ? `Remembers the last ${KEEP_TURNS} turns with ${fanName || 'this fan'}` : 'Earlier turns aren’t sent'}</span>
            <span aria-hidden="true">·</span>
            <button className="link accent" onClick={() => clearTurns(fanKey).then(() => setTurns([]))}>
              Clear
            </button>
          </div>
        ) : (
          !pending && (
            <div className="ai-empty">
              <SparkIcon size={20} />
              <p>Ask about {fanName || 'this fan'}, or say what to write.</p>
              <p className="hint">“a few replies to the last one” · “what should I charge for a custom?”</p>
            </div>
          )
        )}
        {turns.map((turn) => (
          <Turn key={turn.at} turn={turn} findRestricted={findRestricted} insert={insert} onDeliver={deliver} />
        ))}
        {pending && (
          <>
            <p className="ai-ask">{pending.ask}</p>
            {pending.error ? (
              <div className="ai-answer">
                <p className="error">{pending.error}</p>
                <button className="btn small" onClick={() => send(pending.ask)}>
                  Try again
                </button>
              </div>
            ) : (
              <div className="ai-answer" aria-busy="true">
                <span className="ai-who">
                  <span className="spinner" />
                  Writing…
                </span>
                <div className="version loading" />
              </div>
            )}
          </>
        )}
      </main>

      <footer className="ai-composer">
        {restricted > 0 && (
          <button className="ai-blocked" onClick={onShowFan}>
            <BanIcon size={14} />
            Your message has {restricted} restricted {restricted === 1 ? 'word' : 'words'}
            <ChevronRightIcon size={12} />
          </button>
        )}
        <div className="ai-input">
          <textarea
            aria-label={`Ask AI about ${fanName || 'this fan'}`}
            placeholder={`Ask about ${fanName || 'this fan'}, or say what to write…`}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <div className="ai-input-bar">
            <button
              className="chip-toggle"
              role="switch"
              aria-checked={settings.aiSeesChat}
              title={settings.aiSeesChat ? 'AI sees the messages on the page' : 'AI doesn’t see the chat'}
              onClick={() => updateSettings((s) => void (s.aiSeesChat = !s.aiSeesChat)).catch(() => {})}
            >
              {settings.aiSeesChat && <CheckIcon size={12} />}
              {settings.aiSeesChat ? (thread ? `Chat · ${thread.length} ${thread.length === 1 ? 'message' : 'messages'}` : 'Chat') : 'Chat off'}
            </button>
            <button className="send-button" aria-label="Send" disabled={!input.trim() || loading} onClick={() => send(input)}>
              <SendIcon size={15} />
            </button>
          </div>
        </div>
      </footer>
      {note && <p className="toast">{note}</p>}
    </>
  );
}

function useTurns(fanKey: string) {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  useEffect(() => {
    let live = true;
    getTurns(fanKey).then((t) => live && setTurns(t));
    const stop = onTurnsChanged(fanKey, (t) => live && setTurns(t));
    return () => {
      live = false;
      stop();
    };
  }, [fanKey]);
  return [turns, setTurns] as const;
}

function Turn({
  turn,
  findRestricted,
  insert,
  onDeliver,
}: {
  turn: AiTurn;
  findRestricted: WordCheck['find'];
  insert: boolean;
  onDeliver: (text: string) => void;
}) {
  const parts = useMemo(() => parseAnswer(turn.answer), [turn.answer]);
  return (
    <>
      <p className="ai-ask">{turn.ask}</p>
      <div className="ai-answer">
        <span className="ai-who">
          <SparkIcon size={13} />
          {turn.model}
        </span>
        {parts.map((part, i) =>
          part.kind === 'note' ? (
            <p key={i} className="ai-note">
              {part.text}
            </p>
          ) : (
            <Message key={i} text={part.text} marks={findRestricted(part.text)} insert={insert} onDeliver={onDeliver} />
          ),
        )}
      </div>
    </>
  );
}

// A message the AI wrote for the chat, checked for restricted words.
function Message({ text, marks, insert, onDeliver }: { text: string; marks: Match[]; insert: boolean; onDeliver: (text: string) => void }) {
  const held = marks.length;
  return (
    <div className="version">
      <p>
        <Highlighted text={text} marks={marksOf(marks)} />
      </p>
      <div className="version-bar">
        {held ? (
          <span className="status danger">
            <BanIcon size={12} />
            {held} restricted {held === 1 ? 'word' : 'words'}
          </span>
        ) : (
          <span className="status ok">
            <ShieldIcon size={12} />
            Clean
          </span>
        )}
        <div>
          {insert && (
            <button className="btn small square" aria-label="Copy" title="Copy" onClick={() => copyText(text)}>
              <CopyIcon />
            </button>
          )}
          <button className="btn primary small" disabled={held > 0} onClick={() => onDeliver(text)}>
            {insert ? <InsertIcon /> : <CopyIcon />}
            {insert ? 'Insert' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
