import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Everything that turns a device credential into the value stored in the
 * database. Provisioning, seeding and verification all go through here — if
 * they ever disagreed about hashing or normalisation, every device would fail
 * to authenticate with no obvious cause.
 */

/** Crockford base32 minus I, L, O and U: no character pair a human can confuse. */
const PAIRING_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAIRING_GROUPS = 3;
const PAIRING_GROUP_LENGTH = 4;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 32 bytes of entropy, base64url so it survives a shell, a header and a file. */
export function generateDeviceSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * A short code a person can read off paper and retype, e.g. `K7M4-9QXP-2R8T`.
 * 12 characters of a 32-symbol alphabet is 60 bits — not guessable, and the
 * link endpoint should be rate limited regardless.
 */
export function generatePairingCode(): string {
  // randomInt, not Math.random: this code is the only thing between a stranger
  // and a live location feed. randomInt is also unbiased, unlike `% length`.
  const characters = Array.from(
    { length: PAIRING_GROUPS * PAIRING_GROUP_LENGTH },
    () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)],
  );

  const groups: string[] = [];
  for (let i = 0; i < characters.length; i += PAIRING_GROUP_LENGTH) {
    groups.push(characters.slice(i, i + PAIRING_GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

/**
 * Hyphens and case are presentation, not content: a guardian who types
 * `k7m49qxp2r8t` meant the same code that was printed as `K7M4-9QXP-2R8T`.
 */
export function normalizePairingCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export function hashPairingCode(code: string): string {
  return sha256Hex(normalizePairingCode(code));
}

/**
 * Compare a presented secret against a stored hash without leaking, through
 * timing, how many leading bytes were correct. A plain `===` on hex strings
 * short-circuits at the first mismatch and gives away the secret byte by byte.
 */
export function matchesHash(presented: string, storedHex: string): boolean {
  const presentedDigest = createHash('sha256')
    .update(presented, 'utf8')
    .digest();

  let storedDigest: Buffer;
  try {
    storedDigest = Buffer.from(storedHex, 'hex');
  } catch {
    return false;
  }

  // timingSafeEqual throws on a length mismatch, which only a corrupt row can
  // cause; treat it as a failed match rather than a 500.
  if (storedDigest.length !== presentedDigest.length) return false;
  return timingSafeEqual(presentedDigest, storedDigest);
}
