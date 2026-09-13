// JSON schemas for AI output. The same objects are sent to the provider as strict structured-output
// formats and compiled with Ajv to re-check whatever comes back (live or fallback).
const Ajv = require('ajv');
const text = { type: 'string', minLength: 1, maxLength: 1200 };
const nullableId = { type: ['integer', 'null'], minimum: 1 };
const list = { type: 'array', items: text, minItems: 1, maxItems: 8 };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const categories = ['training', 'mentoring', 'certification', 'job_rotation', 'project_experience'];
const actionSchema = object({
  category: { type: 'string', enum: categories },
  employeeId: nullableId, mentorId: nullableId, resourceId: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
  status: { type: 'string', enum: ['proposed', 'needs_review', 'not_applicable'] },
  targetProficiency: { type: 'integer', minimum: 1, maximum: 5 },
  rationale: text, action: text,
  estimatedDurationMonths: { type: ['integer', 'null'], minimum: 1, maximum: 60 },
  milestone: text, verificationMethod: text, assumptions: list,
});
const developmentSchema = object({ actions: { type: 'array', items: actionSchema, minItems: 5, maxItems: 5 } });
const requirementSchema = object({
  skillId: nullableId, skillName: { type: 'string', minLength: 1, maxLength: 100 },
  rationale: text, targetProficiency: { type: 'integer', minimum: 1, maximum: 5 },
  requiredHolders: { type: 'integer', minimum: 1, maximum: 10000 },
  criticality: { type: 'integer', minimum: 1, maximum: 5 },
  effectiveMonth: { type: 'integer', minimum: 0, maximum: 60 },
  sourcing: { type: 'string', enum: ['build', 'hire', 'partner', 'review'] },
  sourcingRationale: text, assumptions: list,
});
const strategySchema = object({ requirements: { type: 'array', items: requirementSchema, maxItems: 8 } });
const ajv = new Ajv({ allErrors: true });
const validators = { development: ajv.compile(developmentSchema), strategy: ajv.compile(strategySchema) };
function validateShape(kind, payload) {
  if (!validators[kind](payload)) throw new Error(`Invalid ${kind} output structure`);
  return payload;
}
module.exports = { categories, developmentSchema, strategySchema, validateShape };
