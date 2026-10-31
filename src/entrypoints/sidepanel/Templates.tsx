import { useEffect, useMemo, useState } from 'react';
import { type Template, updateSettings } from '@/lib/store';
import { fillTemplateMarked } from '@/lib/templates';
import { Highlighted, type Mark } from './Highlighted';
import { type WordCheck, marksOf } from './words';
import { BackIcon, CloseIcon, PencilIcon, PlusIcon, SearchIcon, SmallCloseIcon, StarFilledIcon, StarIcon, TemplatesIcon } from './icons';
import { Sheet } from './Sheet';

interface TemplatesSheetProps {
  templates: Template[];
  check: WordCheck;
  fanName: string;
  insert: boolean; // Insert into the chat, or Copy
  onDeliver: (template: Template, text: string) => void;
  onClose: () => void;
}

const FAVORITES = '\u0000favorites'; // a filter value no tag can take

const save = (mutate: Parameters<typeof updateSettings>[0]) =>
  updateSettings(mutate).catch((error) => console.error('Nook: save failed', error));

// Saved replies, dozens of them: found by search, tag or star, the usual ones first, and
// filled in with the fan's name. Arrows pick one, Enter uses it.
export function TemplatesSheet({ templates, check, fanName, insert, onDeliver, onClose }: TemplatesSheetProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const findRestricted = check.find;

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of templates) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [templates]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = templates
      .filter((t) => (filter === FAVORITES ? t.favorite : !filter || t.tags.includes(filter)))
      .filter((t) => !q || t.text.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)))
      .sort((a, b) => b.uses - a.uses || b.createdAt - a.createdAt);
    // Favorites on top, unless the list is already narrowed down.
    if (filter || q) return { favorites: [], rest: matches };
    return { favorites: matches.filter((t) => t.favorite), rest: matches.filter((t) => !t.favorite) };
  }, [templates, query, filter]);
  const ordered = [...sections.favorites, ...sections.rest];

  useEffect(() => setSelected(0), [query, filter]);

  const view = (template: Template) => {
    const filled = fillTemplateMarked(template.text, fanName);
    const restricted = findRestricted(filled.text);
    const marks: Mark[] = [
      ...marksOf(restricted),
      ...filled.names.filter((n) => !restricted.some((r) => r.start < n.end && n.start < r.end)).map((n) => ({ ...n, className: 'name' })),
    ].sort((a, b) => a.start - b.start);
    return { text: filled.text, marks, blocked: restricted.length > 0 };
  };

  const use = (template: Template | undefined) => {
    if (!template) return;
    const { text, blocked } = view(template);
    if (!blocked) onDeliver(template, text);
  };

  if (editing) {
    return (
      <Sheet label={editing === 'new' ? 'New template' : 'Edit template'} onClose={() => setEditing(null)}>
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          allTags={tags.map(([tag]) => tag)}
          fanName={fanName}
          findRestricted={findRestricted}
          onDone={() => setEditing(null)}
        />
      </Sheet>
    );
  }

  const row = (template: Template, i: number) => {
    const { text, marks, blocked } = view(template);
    return (
      <li key={template.id} className={i === selected ? 'template selected' : 'template'} onMouseEnter={() => setSelected(i)}>
        <button className="template-use" disabled={blocked} onClick={() => use(template)}>
          <span className="template-text">
            <Highlighted text={text} marks={marks} />
          </span>
          <span className="template-meta">
            {template.tags.join(' · ')}
            {blocked ? (
              <span className="pill">Restricted word</span>
            ) : (
              i === selected && (
                <span className="done">
                  <span className="kbd">↵</span>
                  {insert ? 'Insert' : 'Copy'}
                </span>
              )
            )}
          </span>
        </button>
        <button className="icon-button edit" aria-label="Edit template" title="Edit" onClick={() => setEditing(template)}>
          <PencilIcon />
        </button>
        <button
          className={template.favorite ? 'icon-button star on' : 'icon-button star'}
          aria-label={template.favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={template.favorite}
          onClick={() =>
            save((s) => {
              const t = s.templates.find((x) => x.id === template.id);
              if (t) t.favorite = !t.favorite;
            })
          }
        >
          {template.favorite ? <StarFilledIcon /> : <StarIcon />}
        </button>
      </li>
    );
  };

  return (
    <Sheet label="Templates" onClose={onClose}>
      <div className="sheet-head">
        <span className="status accent">
          <TemplatesIcon size={17} />
        </span>
        <h2>Templates</h2>
        <button className="icon-button" aria-label="Close" title="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="sheet-search">
        <label className="search">
          <SearchIcon />
          <input
            autoFocus
            aria-label="Search templates"
            placeholder={templates.length ? `Search ${templates.length} templates` : 'Search templates'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((s) => Math.min(ordered.length - 1, s + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((s) => Math.max(0, s - 1));
              }
              if (e.key === 'Enter') use(ordered[selected]);
            }}
          />
          <span className="kbd">esc</span>
        </label>
        <button className="btn primary square" aria-label="New template" title="New template" onClick={() => setEditing('new')}>
          <PlusIcon />
        </button>
      </div>

      {templates.length > 0 && (
        <div className="filters" role="group" aria-label="Show">
          <button className={filter === '' ? 'filter active' : 'filter'} onClick={() => setFilter('')}>
            All <span>{templates.length}</span>
          </button>
          <button className={filter === FAVORITES ? 'filter active' : 'filter'} onClick={() => setFilter(FAVORITES)}>
            <span className="star on">
              <StarFilledIcon size={12} />
            </span>
            Favorites <span>{templates.filter((t) => t.favorite).length}</span>
          </button>
          {tags.map(([tag, count]) => (
            <button key={tag} className={filter === tag ? 'filter active' : 'filter'} onClick={() => setFilter(filter === tag ? '' : tag)}>
              {tag} <span>{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sheet-body tight">
        {sections.favorites.length > 0 && (
          <>
            <h3 className="label section-title">
              <span className="star on">
                <StarFilledIcon size={12} />
              </span>
              Favorites
            </h3>
            <ul className="template-list">{sections.favorites.map(row)}</ul>
            {sections.rest.length > 0 && <h3 className="label section-title">More · {sections.rest.length}</h3>}
          </>
        )}
        <ul className="template-list">{sections.rest.map((t, i) => row(t, i + sections.favorites.length))}</ul>
        {!templates.length && <p className="empty-note">No templates yet. Save the replies you send again and again.</p>}
        {templates.length > 0 && !ordered.length && <p className="empty-note">Nothing matches.</p>}
      </div>

      <div className="sheet-foot">
        <span>
          <mark className="name">{'{name}'}</mark> becomes the fan’s name
        </span>
        <span>
          <span className="kbd">↑</span> <span className="kbd">↓</span> pick <span className="kbd">↵</span> {insert ? 'insert' : 'copy'}
        </span>
      </div>
    </Sheet>
  );
}

interface EditorProps {
  template: Template | null; // null for a new one
  allTags: string[];
  fanName: string;
  findRestricted: WordCheck['find'];
  onDone: () => void;
}

function TemplateEditor({ template, allTags, fanName, findRestricted, onDone }: EditorProps) {
  const [text, setText] = useState(template?.text ?? '');
  const [tags, setTags] = useState(template?.tags ?? []);
  const [favorite, setFavorite] = useState(template?.favorite ?? false);
  const [tagDraft, setTagDraft] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '');
    setTagDraft('');
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) setTags([...tags, tag]);
  };
  const suggestions = allTags
    .filter((tag) => !tags.includes(tag) && tag.toLowerCase().startsWith(tagDraft.trim().toLowerCase()))
    .slice(0, 8);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    const finalTags = tagDraft.trim() ? [...tags, tagDraft.trim()] : tags;
    save((s) => {
      const existing = template && s.templates.find((t) => t.id === template.id);
      if (existing) Object.assign(existing, { text: body, tags: finalTags, favorite });
      else s.templates.push({ id: crypto.randomUUID(), text: body, tags: finalTags, favorite, uses: 0, createdAt: Date.now() });
    });
    onDone();
  };
  const remove = () => {
    if (!template) return;
    if (!confirming) return setConfirming(true);
    save((s) => {
      s.templates = s.templates.filter((t) => t.id !== template.id);
    });
    onDone();
  };

  const preview = fanName ? fillTemplateMarked(text, fanName) : null;
  const restricted = findRestricted(preview?.text ?? text);

  return (
    <>
      <div className="sheet-head with-back">
        <button className="icon-button" aria-label="Back to templates" onClick={onDone}>
          <BackIcon />
        </button>
        <h2>{template ? 'Edit template' : 'New template'}</h2>
        <button
          className={favorite ? 'icon-button star on' : 'icon-button star'}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={favorite}
          onClick={() => setFavorite(!favorite)}
        >
          {favorite ? <StarFilledIcon size={18} /> : <StarIcon size={18} />}
        </button>
      </div>
      <div className="sheet-body">
        <label className="stack">
          <span className="label">Text</span>
          <textarea
            className="field"
            rows={4}
            autoFocus
            placeholder="Hey {name}, …"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
        {text.trim() && (preview?.names.length || restricted.length) ? (
          <div className="preview">
            <span className="hint tiny">{preview?.names.length ? `For ${fanName} it reads` : 'Reads'}</span>
            <span>
              <Highlighted
                text={preview?.text ?? text}
                marks={[
                  ...marksOf(restricted),
                  ...(preview?.names ?? [])
                    .filter((n) => !restricted.some((r) => r.start < n.end && n.start < r.end))
                    .map((n) => ({ ...n, className: 'name' })),
                ].sort((a, b) => a.start - b.start)}
              />
            </span>
          </div>
        ) : (
          <p className="hint">{'{name}'} becomes the fan’s name.</p>
        )}
        <div className="stack">
          <span className="label">Tags</span>
          <div className="tag-box">
            {tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
                <button aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((t) => t !== tag))}>
                  <SmallCloseIcon />
                </button>
              </span>
            ))}
            <input
              aria-label="Add a tag"
              placeholder="Add a tag"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(tagDraft);
                }
                if (e.key === 'Backspace' && !tagDraft && tags.length) setTags(tags.slice(0, -1));
              }}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((tag) => (
                <button key={tag} className="suggestion" onClick={() => addTag(tag)}>
                  + {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="sheet-foot">
        {template && (
          <button className={confirming ? 'link danger' : 'link'} onClick={remove}>
            {confirming ? 'Click again to delete' : 'Delete'}
          </button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn primary" disabled={!text.trim()} onClick={submit}>
          Save
        </button>
      </div>
    </>
  );
}
