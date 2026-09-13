import { useMemo, useState } from 'react';

// Client-side pagination for the decision tables. The page number lives in the hash query (`page=3`)
// so a link to page 3 of a filtered list opens on page 3; `useUrlFilters` rebuilds the query from
// its own keys whenever a filter changes, which drops `page` and matches the reset below.
//
// `resetKey` is whatever should send the reader back to page 1 (normally the serialized filters):
// the page is derived from it during render, so there is no effect and no extra render.

export const PAGE_SIZES = [25, 50, 100];

function readQuery() {
  return new URLSearchParams(window.location.hash.replace(/^#\/?[^?]*\??/, ''));
}

function writeQueryParam(name, value) {
  const [path = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const params = readQuery();
  if (value === null || value === undefined || value === '') params.delete(name);
  else params.set(name, String(value));
  const search = params.toString();
  const next = `#/${path}${search ? `?${search}` : ''}`;
  if (next !== window.location.hash) window.history.replaceState(null, '', next);
}

const positiveInt = (raw, fallback) => (/^\d{1,6}$/.test(raw ?? '') && Number(raw) > 0 ? Number(raw) : fallback);

// Drops the page from the URL; call it when a page switches to a different list (for example a tab change).
export const clearPageParam = () => writeQueryParam('page', null);

export function usePagedList(items, { pageSize = 25, resetKey = '' } = {}) {
  const [state, setState] = useState(() => {
    const params = readQuery();
    const size = positiveInt(params.get('size'), pageSize);
    return { resetKey, page: positiveInt(params.get('page'), 1), size: PAGE_SIZES.includes(size) ? size : pageSize };
  });

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / state.size));
  // A changed resetKey (new filters) or a list that shrank below the current page both land on a valid page.
  const page = Math.min(state.resetKey === resetKey ? state.page : 1, pages);
  const from = total === 0 ? 0 : (page - 1) * state.size + 1;
  const to = Math.min(total, page * state.size);
  const pageItems = useMemo(() => items.slice((page - 1) * state.size, page * state.size), [items, page, state.size]);

  const setPage = (next) => {
    const clamped = Math.min(Math.max(1, Number(next) || 1), pages);
    writeQueryParam('page', clamped === 1 ? null : clamped);
    setState({ resetKey, page: clamped, size: state.size });
  };
  const setSize = (next) => {
    const size = PAGE_SIZES.includes(Number(next)) ? Number(next) : pageSize;
    writeQueryParam('size', size === pageSize ? null : size);
    writeQueryParam('page', null);
    setState({ resetKey, page: 1, size });
  };

  return { items: pageItems, page, pages, size: state.size, total, from, to, setPage, setSize };
}
