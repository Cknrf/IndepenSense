// The wearable sends emergency SMS over its cellular modem, which dials the
// stored number verbatim and fails silently on anything that is not E.164.
// Numbers are therefore normalised and checked here, on the way into the
// database, rather than relying only on the device's defensive pass.
// Philippine mobile numbers are the only ones that can receive the device's
// SMS, so they are held to their exact shape rather than to generic E.164:
// country code 63, then a 10-digit subscriber number always starting with 9.
// Generic E.164 is far too loose here — it would accept +63912931931, a
// 9-digit number that looks plausible but reaches no one.
const PH_MOBILE = /^\+639\d{9}$/;

/**
 * Returns the E.164 form of `raw`, or null if it cannot be made valid.
 *
 * Guardians are all in the Philippines, so local shorthand is expanded to +63:
 *   09171234567   -> +639171234567   (national trunk prefix)
 *   9171234567    -> +639171234567   (bare subscriber number)
 *   639171234567  -> +639171234567   (country code, missing the plus)
 *   00639171234567-> +639171234567   (international call prefix)
 *
 * Everything else is rejected, including well-formed foreign numbers. The
 * wearable's modem is the only delivery path for an emergency SMS, and it
 * reaches PH mobiles — so a +1 number is not a guardian who gets alerted late,
 * it is a guardian who is never alerted at all.
 *
 * A PH landline (+632…) is rejected for the same reason: it cannot receive SMS,
 * and storing one would look fine on the web form while silently failing on the
 * device at the moment it matters.
 */
export function normalizeE164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  let cleaned = raw.trim().replace(/[\s\-().]/g, '');

  // Order matters: "00" is an international prefix, so it must be consumed
  // before the single leading "0" is read as the national trunk prefix.
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = '+63' + cleaned.slice(1);
  } else if (/^639\d{9}$/.test(cleaned)) {
    cleaned = '+' + cleaned;
  } else if (/^9\d{9}$/.test(cleaned)) {
    cleaned = '+63' + cleaned;
  }

  return PH_MOBILE.test(cleaned) ? cleaned : null;
}
