// Adapter for the optional live AI provider (OpenAI Responses API with strict JSON schema output).
// Configured by KEYSTONE_AI_PROVIDER, OPENAI_API_KEY and KEYSTONE_AI_MODEL; without them it reports
// demo mode and the recommendation service uses rule-based fallbacks.
const OpenAI = require('openai');

// A failure carrying only a short reason code, safe to return to the client and to log.
class ProviderFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Guards applied before any network call: at most 3 concurrent requests, a 100 KB input cap, and a
// bounded timeout. Responses are stored nowhere upstream (store: false).
function createProvider({ env = process.env, clientFactory = (options) => new OpenAI(options) } = {}) {
  const provider = env.KEYSTONE_AI_PROVIDER || 'auto';
  const model = env.KEYSTONE_AI_MODEL?.trim();
  const apiKey = env.OPENAI_API_KEY?.trim();
  const reason = provider === 'demo' ? 'demo_requested' : !['auto', 'openai'].includes(provider) ? 'unsupported_provider'
    : !apiKey ? 'missing_api_key' : !model ? 'missing_model' : null;
  const timeoutMs = Math.min(60000, Math.max(1000, Number(env.KEYSTONE_AI_TIMEOUT_MS) || 20000));
  let client;
  let active = 0;
  return {
    status: { provider: reason ? 'demo' : 'openai', configured: !reason, model: reason ? null : model, reason },
    async generate({ name, schema, instructions, context }) {
      if (reason) throw new ProviderFailure(reason);
      if (active >= 3) throw new ProviderFailure('busy');
      const input = JSON.stringify(context);
      if (input.length > 100000) throw new ProviderFailure('context_too_large');
      active += 1;
      try {
        client ||= clientFactory({ apiKey, timeout: timeoutMs, maxRetries: 1 });
        const response = await client.responses.create({
          model, store: false, instructions, input,
          max_output_tokens: 6000,
          text: { format: { type: 'json_schema', name, strict: true, schema } },
        });
        if (response.status !== 'completed') throw new ProviderFailure('incomplete_response');
        if (response.output?.some((item) => item.content?.some((part) => part.type === 'refusal'))) throw new ProviderFailure('refusal');
        if (!response.output_text || response.output_text.length > 80000) throw new ProviderFailure('invalid_response');
        try { return JSON.parse(response.output_text); } catch { throw new ProviderFailure('invalid_response'); }
      } catch (error) {
        if (error instanceof ProviderFailure) throw error;
        // Do not expose upstream messages, headers, credentials, or submitted workforce data.
        if (error.status === 401 || error.status === 403) throw new ProviderFailure('authentication_failed');
        if (error.status === 429) throw new ProviderFailure('rate_limited');
        if (/timeout/i.test(error.name || '')) throw new ProviderFailure('timeout');
        throw new ProviderFailure('provider_unavailable');
      } finally { active -= 1; }
    },
  };
}
module.exports = { createProvider, ProviderFailure };
