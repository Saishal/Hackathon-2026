import { useState } from 'react';
import { useSession } from '../session';
import { useT } from '../preferences/context';
import { answerQuestion, QUICK_PROMPTS } from '../help/assistant.js';
import Dialog from './Dialog';
import Icon from './Icon';

// Top-bar help assistant. Answers come from the local rule-based catalog in help/assistant.js: no
// network request, no logging and no storage. The question and answer live only in this component's
// state and are cleared when the dialog closes.
export default function KeystoneAssistant() {
  const session = useSession();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const ask = (text) => { setAnswer(answerQuestion(text, session)); setQuestion(''); };
  const close = () => { setOpen(false); setQuestion(''); setAnswer(null); };
  return <>
    <button type="button" className="btn btn-secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="question" size={16} />{t('assistant.title')}</button>
    {open && <Dialog title={t('assistant.title')} onClose={close} description={t('assistant.welcome')}>
      <p className="muted small">{t('assistant.privacy')}</p>
      <div className="assistant-prompts">{QUICK_PROMPTS.map((text) => <button className="btn btn-secondary" type="button" key={text} onClick={() => ask(text)}>{text}</button>)}</div>
      <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); if (question.trim()) ask(question); }}>
        <label className="field">{t('assistant.question')}<input type="text" value={question} maxLength={300} onChange={(event) => setQuestion(event.target.value)} autoComplete="off" /></label>
        <button type="submit" className="btn btn-primary" disabled={!question.trim()}>{t('assistant.ask')}</button>
      </form>
      {answer && <section className="panel assistant-answer" aria-live="polite" aria-atomic="true"><p>{answer.text}</p><div className="assistant-prompts">{answer.shortcuts.map((link) => <a key={link.href} className="btn btn-secondary" href={link.href} onClick={close}>{link.label}</a>)}</div></section>}
    </Dialog>}
  </>;
}
