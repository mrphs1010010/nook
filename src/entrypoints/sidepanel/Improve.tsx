import { useEffect, useMemo, useRef, useState } from 'react';
import { type AiSettings, improve } from '@/lib/ai';
import type { Match } from '@/lib/restricted';
import { type Delivery, copyText } from './chat';
import { Highlighted } from './Highlighted';
import { CloseIcon, CopyIcon, ImproveIcon, InsertIcon, RefreshIcon } from './icons';
import { Sheet } from './Sheet';
import { type WordCheck, marksOf } from './words';

interface ImproveProps {
  draft: string; // what is typed in the chat
  instruction: string; // to start with
  autoRun: boolean;
  ai: AiSettings | null;
  check: WordCheck;
  insert: boolean; // whether Nook may type into the chat, else it copies
  onDeliver: (text: string) => Promise<Delivery>;
  onNeedKey: () => void;
  onClose: () => void;
}

const COUNT = 3;

// The creator says what they want (with a draft, or instead of one) and AI writes a few versions.
export function ImproveSheet({ draft, instruction: initial, autoRun, ai, check, insert, onDeliver, onNeedKey, onClose }: ImproveProps) {
  const [instruction, setInstruction] = useState(initial);
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; versions: string[]; error?: string }>({
    status: 'idle',
    versions: [],
  });
  const runId = useRef(0);
  const findRestricted = check.find;
  const canRun = Boolean(draft.trim() || instruction.trim());

  const run = async () => {
    if (!canRun) return;
    if (!ai?.apiKey) return onNeedKey();
    const id = ++runId.current;
    setState((s) => ({ ...s, status: 'loading', error: undefined }));
    try {
      const versions = await improve(draft.trim(), instruction.trim(), { ai, restrictedWords: check.avoidWords, restrictedTopics: check.avoidTopics, count: COUNT });
      if (id === runId.current) setState({ status: 'done', versions });
    } catch (error) {
      if (id === runId.current) setState({ status: 'error', versions: [], error: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    if (autoRun) run();
    return () => {
      runId.current++; // ignore answers that come back after closing
    };
    // Runs once, for "Rewrite without them".
  }, []);

  const loading = state.status === 'loading';
  return (
    <Sheet label="Improve" onClose={onClose}>
      <div className="sheet-head">
        <span className="status accent">
          <ImproveIcon size={17} />
        </span>
        <h2>Improve</h2>
        <button className="icon-button" aria-label="Close" title="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="sheet-body">
        <div className="stack">
          <h3 className="label">Draft from the chat</h3>
          {draft.trim() ? <p className="mirror">{draft}</p> : <p className="hint">Nothing typed in the chat. Say below what to write.</p>}
        </div>
        <div className="stack">
          <h3 className="label">Your instruction</h3>
          <div className="instruction">
            <textarea
              autoFocus={!autoRun}
              aria-label="Your instruction"
              placeholder="e.g. make it flirtier, tease that the new set drops tonight"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  run();
                }
              }}
            />
            <div className="instruction-bar">
              <span className="hint tiny">A draft, an instruction, or both</span>
              <button className="btn primary small" disabled={!canRun || loading} onClick={run}>
                {loading ? <span className="spinner" /> : <RefreshIcon />}
                {loading ? 'Writing…' : state.status === 'idle' ? 'Write versions' : 'Write again'}
              </button>
            </div>
          </div>
        </div>
        {state.error && <p className="error">{state.error}</p>}
        {loading && (
          <div className="stack" aria-busy="true" aria-label="Writing">
            <h3 className="label">Writing {COUNT} versions…</h3>
            {Array.from({ length: COUNT }, (_, i) => (
              <div className="version loading" key={i} />
            ))}
          </div>
        )}
        {!loading && state.versions.length > 0 && (
          <div className="stack">
            <h3 className="label">
              {state.versions.length} {state.versions.length === 1 ? 'version' : 'versions'}
            </h3>
            {state.versions.map((version, i) => (
              <Version key={i} n={i + 1} text={version} marks={findRestricted(version)} insert={insert} onDeliver={onDeliver} />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Version({
  n,
  text,
  marks,
  insert,
  onDeliver,
}: {
  n: number;
  text: string;
  marks: Match[];
  insert: boolean;
  onDeliver: ImproveProps['onDeliver'];
}) {
  return (
    <div className="version">
      <p>
        <Highlighted text={text} marks={marksOf(marks)} />
      </p>
      <div className="version-bar">
        <span>Version {n}</span>
        <div>
          {insert && (
            <button className="btn small square" aria-label={`Copy version ${n}`} title="Copy" onClick={() => copyText(text)}>
              <CopyIcon />
            </button>
          )}
          <button className="btn primary small" disabled={marks.length > 0} onClick={() => onDeliver(text)}>
            {insert ? <InsertIcon /> : <CopyIcon />}
            {insert ? 'Insert' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
