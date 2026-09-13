import Icon from './Icon';
import { useT } from '../preferences/context';
import { PAGE_SIZES, usePagedList } from '../filters/usePagedList';

// Pager for a `usePagedList` result. Renders nothing while everything fits on the smallest page, so
// short lists stay uncluttered; otherwise a range summary, rows-per-page and previous/next with a
// live page label. `anchorId` names the element to scroll back to when the page changes.
// Wraps a list: `children(pageItems, pager)` renders the current page, then the pager follows it.
export function PagedList({ items, resetKey, pageSize, noun, anchorId, children }) {
  const pager = usePagedList(items, { pageSize, resetKey });
  return <>{children(pager.items, pager)}<Pagination pager={pager} noun={noun} anchorId={anchorId} /></>;
}

export default function Pagination({ pager, noun, anchorId }) {
  const t = useT();
  const { page, pages, size, total, from, to, setPage, setSize } = pager;
  if (total <= PAGE_SIZES[0] && size === PAGE_SIZES[0]) return null;

  const go = (next) => {
    setPage(next);
    if (anchorId) document.getElementById(anchorId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <nav className="pager" aria-label={t('pager.label')}>
      <p className="pager-summary" aria-live="polite">{t('pager.range', { from, to, total, noun: noun ? t(`pager.noun.${noun}`, { defaultValue: noun }) : t('filters.records') })}</p>
      <div className="pager-controls">
        <label className="field field-inline">{t('pager.rows')}
          <select value={size} onChange={(event) => setSize(event.target.value)}>
            {PAGE_SIZES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label={t('pager.previous')}>
          <Icon name="chevron" size={14} className="rotate-180" /> {t('pager.previousShort')}
        </button>
        <span className="pager-page">{t('pager.page', { page, pages })}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(page + 1)} disabled={page >= pages} aria-label={t('pager.next')}>
          {t('pager.nextShort')} <Icon name="chevron" size={14} />
        </button>
      </div>
    </nav>
  );
}
