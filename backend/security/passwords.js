const crypto = require('node:crypto');
const { promisify } = require('node:util');

// scrypt is a memory-hard password KDF recommended alongside Argon2id by OWASP and ships with Node,
// so hashing needs no native add-on. Parameters are stored with each hash so they can be raised later.
const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 32768, r: 8, p: 1, keyLength: 64 };
const MAX_MEMORY = 128 * 1024 * 1024;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

async function derive(password, salt, { N, r, p, keyLength }) {
  return scrypt(password.normalize('NFKC'), salt, keyLength, { N, r, p, maxmem: MAX_MEMORY });
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new Error(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  }
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, N, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'),
    { N: Number(N), r: Number(r), p: Number(p), keyLength: expected.length });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Verifying against a throwaway hash when the email is unknown keeps the response time the same,
// so login timing does not reveal which accounts exist.
let dummyHash;
async function verifyAgainstDummy(password) {
  dummyHash ||= await hashPassword(crypto.randomBytes(24).toString('base64'));
  await verifyPassword(typeof password === 'string' ? password : '', dummyHash);
  return false;
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy, PASSWORD_MIN, PASSWORD_MAX };
