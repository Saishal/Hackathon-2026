import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Icon from './Icon';
import { GLOSSARY, TASKS, guideHref } from '../help/content';

// Header search. The server returns only records the signed-in user may see, already grouped;
// help topics are matched here because they are static and public. Implemented as a combobox with a
// listbox: arrow keys move, Enter opens, Escape closes, and screen readers hear the active option.

const DEBOUNCE_MS = 220;
const MIN_LENGTH = 2;

const STATUS_TONE = { critical: 'tag-danger', warning: 'tag-warn', ok: 'tag-ok', submitted: 'tag-warn', approved: 'tag-ok', rejected: 'tag-outline', info: 'tag-outline' };

function helpMatches(query) {
  const needle = query.toLowerCase();
  const items = [];
  for (const [id, entry] of Object.entries(GLOSSARY)) {
    if (entry.term.toLowerCase().includes(needle) || entry.short.toLowerCase().includes(needle)) {
      items.push({ type: 'help', id, title: entry.term, description: entry.short, href: guideHref(id) });
    }
  }
  for (const [id, task] of Object.entries(TASKS)) {
    if (task.title.toLowerCase().includes(needle) || task.intro.toLowerCase().includes(needle)) {
      items.push({ type: 'help', id, title: task.title, description: task.intro, href: guideHref(id) });
    }
  }
  return items.slice(0, 4);
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const listId = useId();
  const trimmed = query.trim();

  // Debounced fetch. The response records which query it answered, so a stale answer for an
  // older query is simply ignored when rendering; nothing else is stored.
  useEffect(() => {
    if (trimmed.length < MIN_LENGTH) return undefined;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const response = await keystoneApi.search(trimmed);
        if (current) { setResult(response); setError(null); }
      } catch (failure) {
        if (current) setError({ query: trimmed, message: failure.message });
      }
    }, DEBOUNCE_MS);
    return () => { current = false; clearTimeout(timer); };
  }, [trimmed]);

  const answered = result?.query === trimmed;
  const failed = error?.query === trimmed;
  const loading = trimmed.length >= MIN_LENGTH && !answered && !failed;

  const groups = useMemo(() => {
    if (trimmed.length < MIN_LENGTH) return [];
    const server = answered ? result.groups : [];
    const help = helpMatches(trimmed);
    return help.length > 0 ? [...server, { type: 'help', label: 'Help and glossary', total: help.length, items: help }] : server;
  }, [result, answered, trimmed]);

  const flat = useMemo(() => groups.flatMap((group) => group.items).map((item, index) => ({ ...item, index })), [groups]);
  const activeIndex = flat.length === 0 ? -1 : Math.min(Math.max(active, 0), flat.length - 1);

  useEffect(() => {
    const onClickOutside = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function go(item) {
    if (!item) return;
    setOpen(false);
    setQuery('');
    window.location.assign(item.href);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!open || flat.length === 0) {
      if (event.key === 'ArrowDown' && flat.length > 0) { setOpen(true); event.preventDefault(); }
      return;
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((activeIndex + 1) % flat.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((activeIndex - 1 + flat.length) % flat.length); }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(flat.length - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); go(flat[activeIndex]); }
  }

  const showPanel = open && trimmed.length >= MIN_LENGTH;
  const activeId = activeIndex >= 0 ? `${listId}-${flat[activeIndex].type}-${flat[activeIndex].id}` : undefined;
  const indexOf = new Map(flat.map((item) => [`${item.type}-${item.id}`, item.index]));

  return (
    <div className="global-search" ref={boxRef}>
      <label className="global-search-field">
        <Icon name="search" size={16} />
        <span className="sr-only">Search Keystone</span>
        <input ref={inputRef} type="search" value={query} placeholder="Search people, skills, risks, scenarios…"
          role="combobox" aria-expanded={showPanel} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={activeId}
          autoComplete="off" spellCheck={false}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
        {loading && <span className="global-search-spinner" aria-hidden="true" />}
        {query && !loading && <button type="button" className="global-search-clear" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}><Icon name="close" size={14} /></button>}
      </label>

      {showPanel && (
        <div className="global-search-panel" id={listId} role="listbox" aria-label="Search results">
          {failed && <p className="global-search-state" role="alert">Search failed: {error.message}</p>}
          {!failed && loading && flat.length === 0 && <p className="global-search-state" role="status">Searching…</p>}
          {!failed && !loading && flat.length === 0 && (
            <p className="global-search-state" role="status">
              No matches for “{trimmed}” in what you can see.{result?.visibility && result.visibility !== 'organization' ? ' Your view is limited to your team or profile.' : ''}
            </p>
          )}
          {groups.map((group) => (
            <section key={group.type} className="global-search-group" aria-label={group.label}>
              <p className="global-search-heading">{group.label}{group.total > group.items.length ? ` · ${group.items.length} of ${group.total}` : ''}</p>
              {group.items.map((item) => {
                const index = indexOf.get(`${item.type}-${item.id}`);
                const id = `${listId}-${item.type}-${item.id}`;
                return (
                  <a key={id} id={id} role="option" aria-selected={index === activeIndex} href={item.href}
                    className={`global-search-item ${index === activeIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => { event.preventDefault(); go(item); }}>
                    <span className="global-search-title">{item.title}</span>
                    <span className="global-search-desc">{item.description}</span>
                    {item.status && STATUS_TONE[item.status] && <span className={`tag ${STATUS_TONE[item.status]}`}>{item.status}</span>}
                  </a>
                );
              })}
            </section>
          ))}
          {flat.length > 0 && <p className="global-search-hint">↑↓ to move · Enter to open · Esc to close</p>}
        </div>
      )}
    </div>
  );
}
