const { analyze } = require('./risk');
const { createProvider, ProviderFailure } = require('./ai/provider');
const { developmentSchema, strategySchema } = require('./ai/schemas');
const { developmentPrompt, strategyPrompt } = require('./ai/prompts');
const { developmentContext, validateDevelopment, normalizeRequirements } = require('./ai/grounding');
const { developmentFallback, strategyFallback } = require('./ai/fallbacks');
const { previewRequirements } = require('./ai/strategy-preview');

function clientError(message) { const error = new Error(message); error.status = 400; throw error; }
function validateDirection(direction) {
  if (typeof direction !== 'string' || !direction.trim() || direction.length > 2000) clientError('direction must contain 1–2000 characters');
  return direction.trim();
}
function createRecommendationService({ provider = createProvider() } = {}) {
  async function generateOrFallback({ name, schema, instructions, context, validate, fallback }) {
    try {
      const payload = await provider.generate({ name, schema, instructions, context });
      return { payload: validate(payload), mode: 'live-ai', fallbackReason: null };
    } catch (error) {
      const fallbackReason = error instanceof ProviderFailure ? error.code : 'invalid_output';
      return { payload: validate(fallback()), mode: 'demo-fallback', fallbackReason };
    }
  }
  return {
    status: () => ({ ...provider.status }),
    async recommend(workforce, skillId) {
      const skill = workforce.skills.find((entry) => entry.id === skillId);
      if (!skill) clientError('Unknown skillId');
      const analysis = analyze(workforce);
      const context = developmentContext(workforce, skill, analysis);
      const result = await generateOrFallback({ name: 'keystone_development', schema: developmentSchema,
        instructions: developmentPrompt, context, validate: (payload) => validateDevelopment(payload, context),
        fallback: () => developmentFallback(context) });
      return { schemaVersion: 1, mode: result.mode, fallbackReason: result.fallbackReason, skillId,
        reviewStatus: 'requires-review', risk: context.risk,
        actions: result.payload.actions.map((action) => ({ ...action, id: `skill-${skillId}-${action.category}`, skillId,
          resource: action.resourceId === null ? null : context.resources.find((resource) => resource.id === action.resourceId),
          durationBasis: action.estimatedDurationMonths === null ? 'not-estimated' : 'estimate-requires-review' })),
        message: result.mode === 'live-ai' ? 'AI draft validated against supplied workforce evidence; review actions and estimates.'
          : 'Rule-based demo recommendations; live AI was unavailable or not configured. Review before use.' };
    },
    async proposeStrategy(direction, workforce = { employees: [], skills: [], matrix: [] }) {
      direction = validateDirection(direction);
      const context = { direction, skills: workforce.skills.map(({ id, name }) => ({ id, name })),
        coverage: analyze(workforce).skills.map(({ id, busFactor, gap }) => ({ skillId: id, recordedQualifiedHolders: busFactor, gap })) };
      const result = await generateOrFallback({ name: 'keystone_strategy', schema: strategySchema,
        instructions: strategyPrompt, context,
        validate: (payload) => ({ requirements: normalizeRequirements(payload, workforce) }),
        fallback: () => strategyFallback(direction, workforce) });
      const requirements = result.payload.requirements;
      const coverage = previewRequirements(workforce, { requirements, reviewed: true, horizonMonths: 60 });
      return { schemaVersion: 1, mode: result.mode, fallbackReason: result.fallbackReason, direction,
        reviewStatus: 'requires-review', persisted: false,
        requirements: requirements.map((requirement, index) => ({ ...requirement, requirementId: `requirement-${index + 1}`,
          coverage: coverage.requirements[index].coverage })),
        message: requirements.length === 0 ? 'Describe a concrete business initiative. No skill requirements were proposed.'
          : result.mode === 'live-ai' ? 'AI-proposed requirements with deterministic coverage; review quantities and dates before use.'
            : 'Deterministic demo proposal, not an AI forecast; each requirement states whether it came from a curated template or from recorded coverage gaps. Review quantities, dates, and sourcing options.',
      };
    },
    previewStrategy: previewRequirements,
  };
}
const service = createRecommendationService();
module.exports = { ...service, createRecommendationService };
