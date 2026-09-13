import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import { can } from './format';
import Icon from './Icon';

// Says plainly which engine answers the AI advisor and, in demo mode, why - so a reviewer never
// mistakes rule-based output for a model, and an admin knows exactly which setting is missing.
// Configuration hints are shown to admins only; other roles just see the mode.

const REASONS = {
  missing_api_key: { text: 'No API key is configured.', hint: 'Set OPENAI_API_KEY and KEYSTONE_AI_MODEL in backend/.env, then restart the backend.' },
  missing_model: { text: 'An API key is set but no model is chosen.', hint: 'Set KEYSTONE_AI_MODEL in backend/.env (gpt-4.1-mini is verified), then restart the backend.' },
  demo_requested: { text: 'Demo mode was requested explicitly.', hint: 'Set KEYSTONE_AI_PROVIDER=auto (or openai) in backend/.env to use the live provider.' },
  unsupported_provider: { text: 'KEYSTONE_AI_PROVIDER names a provider Keystone does not support.', hint: 'Use demo, auto or openai.' },
};

// Why a particular answer fell back to rules even though a provider is configured.
export const FALLBACK_REASONS = {
  busy: 'the provider was already handling the maximum number of requests',
  context_too_large: 'the workforce context was too large to send',
  incomplete_response: 'the provider returned an incomplete answer',
  refusal: 'the provider declined to answer',
  invalid_response: 'the provider returned something that was not valid JSON',
  invalid_output: 'the provider answer failed the grounding checks against recorded evidence',
  authentication_failed: 'the provider rejected the API key',
  rate_limited: 'the provider rate-limited the request',
  timeout: 'the provider did not answer in time',
  provider_unavailable: 'the provider could not be reached',
  fallback_invalid: 'no validated recommendation was available at all',
};

export function fallbackSentence(result) {
  if (!result || result.mode === 'live-ai' || !result.fallbackReason) return null;
  const configured = !(result.fallbackReason in REASONS);
  if (!configured) return null; // The status line above already explains an unconfigured provider.
  const why = FALLBACK_REASONS[result.fallbackReason] ?? result.fallbackReason.replaceAll('_', ' ');
  return `Live AI was tried but ${why}; this answer comes from the rule-based fallback instead.`;
}

export default function AIProviderStatus() {
  const session = useSession();
  const [status, setStatus] = useState(null);
  const admin = can(session, 'users.manage');

  useEffect(() => {
    let live = true;
    keystoneApi.aiStatus().then((result) => { if (live) setStatus(result); }).catch(() => { if (live) setStatus(false); });
    return () => { live = false; };
  }, []);

  if (status === null) return null;
  if (status === false) return <p className="ai-status ai-status-demo"><Icon name="alert" size={14} /> The AI provider status could not be loaded.</p>;
  if (status.configured) {
    return <p className="ai-status ai-status-live"><Icon name="ai" size={14} /> Live AI: {status.provider} · {status.model}. Every answer is still validated against recorded evidence and marked for review.</p>;
  }
  const reason = REASONS[status.reason] ?? { text: 'The live provider is not configured.', hint: null };
  return (
    <p className="ai-status ai-status-demo">
      <Icon name="info" size={14} /> Demo mode: answers come from labeled rules, not a model. {reason.text}
      {admin && reason.hint && <> <span className="muted">{reason.hint}</span></>}
    </p>
  );
}
