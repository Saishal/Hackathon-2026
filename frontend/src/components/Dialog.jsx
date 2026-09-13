import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../preferences/context';
import Icon from './Icon';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal dialog or side drawer. Focus moves inside on open, Tab stays inside, Escape closes, and focus
// returns to whatever opened it.
export default function Dialog({ title, description, onClose, children, footer, variant = 'dialog' }) {
  const t = useT();
  const panel = useRef(null);
  const close = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    const node = panel.current;
    const focusables = () => [...node.querySelectorAll(FOCUSABLE)];
    const initial = node.querySelector('[data-autofocus]') ?? focusables().find((element) => !element.classList.contains('dialog-close'));
    (initial ?? node).focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKeyDown);
    document.body.classList.add('has-dialog');
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('has-dialog');
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={`dialog-backdrop dialog-backdrop-${variant}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close.current(); }}>
      <div ref={panel} className={`dialog dialog-${variant}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <header className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="btn-icon dialog-close" aria-label={t('common.close')} onClick={() => close.current()}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
