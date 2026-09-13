const Ajv = require('ajv');
const { isCalendarDate } = require('../services/clock');
const { validationError } = require('../errors');

// Ajv is already a backend dependency (AI output schemas), so request validation reuses it.
// No type coercion: "3" is not accepted where 3 is required, and unknown fields are rejected.
// strictRequired is off because conditional branches (if/then) require properties declared on the parent schema.
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, verbose: true, coerceTypes: false, useDefaults: false });

ajv.addKeyword({
  keyword: 'calendarDate',
  type: 'string',
  schemaType: 'boolean',
  errors: false,
  validate: (enabled, value) => !enabled || isCalendarDate(value),
});
// Annotation only: a plain-language description of an expected format, used in error messages.
ajv.addKeyword({ keyword: 'formatHint', schemaType: 'string' });

const humanize = (name = 'value') => {
  const words = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const typeWords = (type) => ({ integer: 'a whole number', number: 'a number', string: 'text', boolean: 'true or false',
  array: 'a list', object: 'an object', null: 'empty' }[type] ?? type);

function describe(error) {
  const path = error.instancePath.split('/').filter(Boolean);
  const schema = error.parentSchema ?? {};

  if (error.keyword === 'required') {
    const name = error.params.missingProperty;
    const label = schema.properties?.[name]?.title ?? humanize(name);
    return { field: [...path, name].join('.'), code: 'required', message: `${label} is required.` };
  }
  if (error.keyword === 'additionalProperties') {
    const name = error.params.additionalProperty;
    return { field: [...path, name].join('.'), code: 'unknown_field', message: `"${name}" is not an accepted field.` };
  }

  const field = path.join('.') || '(body)';
  const label = schema.title ?? humanize(path.at(-1) ?? 'Request body');
  switch (error.keyword) {
    case 'type': {
      const types = [].concat(error.params.type).map(typeWords);
      return { field, code: 'invalid_type', message: `${label} must be ${types.join(' or ')}.` };
    }
    case 'minimum':
    case 'maximum':
      return {
        field,
        code: 'out_of_range',
        message: schema.minimum !== undefined && schema.maximum !== undefined
          ? `${label} must be between ${schema.minimum} and ${schema.maximum}.`
          : `${label} must be ${error.keyword === 'minimum' ? 'at least' : 'at most'} ${error.params.limit}.`,
      };
    case 'minLength':
      return { field, code: error.params.limit <= 1 ? 'required' : 'too_short',
        message: error.params.limit <= 1 ? `${label} can't be empty.` : `${label} must be at least ${error.params.limit} characters.` };
    case 'maxLength':
      return { field, code: 'too_long', message: `${label} must be ${error.params.limit} characters or fewer.` };
    case 'pattern':
      return { field, code: 'invalid_format', message: `${label} ${schema.formatHint ?? 'has an invalid format'}.` };
    case 'enum':
      return { field, code: 'invalid_option', message: `${label} must be one of: ${error.params.allowedValues.join(', ')}.` };
    case 'const':
      return { field, code: 'invalid_option', message: `${label} must be ${JSON.stringify(error.params.allowedValue)}.` };
    case 'calendarDate':
      return { field, code: 'invalid_date', message: `${label} must be a real date in YYYY-MM-DD format.` };
    case 'minItems':
      return { field, code: 'too_few', message: `${label} needs at least ${error.params.limit} item(s).` };
    case 'maxItems':
      return { field, code: 'too_many', message: `${label} accepts at most ${error.params.limit} item(s).` };
    case 'uniqueItems':
      return { field, code: 'duplicate', message: `${label} contains duplicates.` };
    default:
      return { field, code: 'invalid', message: `${label} is invalid.` };
  }
}

function compile(schema) {
  const validate = ajv.compile(schema);
  return (value) => {
    if (validate(value)) return value;
    const seen = new Set();
    // "if" only reports that a conditional branch failed; the branch's own errors say what to fix.
    const details = validate.errors.filter((error) => error.keyword !== 'if').map(describe).filter((detail) => {
      const key = `${detail.field}:${detail.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    throw validationError(details);
  };
}

function validateBody(schema) {
  const check = compile(schema);
  return (req, _res, next) => {
    try {
      check(req.body === undefined ? {} : req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { compile, validateBody, humanize };
