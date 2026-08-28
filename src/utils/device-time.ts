// The wearable stamps its own alert times, and it must: an alert can sit in an
// offline retry queue for hours, so server receipt time would file a fall at
// the moment the signal came back. What the device cannot be trusted about is
// whether its clock is right — the Pi has no RTC, so a unit that alerts shortly
// after a power cut, before NTP settles, believes it is 1970.
//
// That is not a cosmetic problem. An alert stamped 1970 sorts to the bottom of
// the newest-first list, never appears in the 5 most recent, and falls outside
// the 7-day history window: a real emergency, invisible on every screen that
// would show it. A fast clock is the mirror image — it pins to the top forever
// and pushes real alerts out of the Recent list.

/** How far ahead of the server a device clock may be before it is disbelieved. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** How far back a queued alert may legitimately reach. */
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The instant an alert should be filed under: the device's own, when it is
 * plausible, and the server's receipt time when it is not.
 *
 * Implausible timestamps are replaced rather than rejected. The alternative is
 * dropping the report, and a fall with a broken clock is still a fall — better
 * filed a few seconds late than not at all.
 *
 * Returns the resolved instant and, when it differs, why — so the caller can
 * log a device whose clock needs looking at.
 */
export function resolveDeviceTime(
  claimed: unknown,
  receivedAt: Date,
): { at: Date; replaced: null | 'unparseable' | 'future' | 'too-old' } {
  const parsed =
    claimed instanceof Date
      ? claimed
      : typeof claimed === 'string' || typeof claimed === 'number'
        ? new Date(claimed)
        : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { at: receivedAt, replaced: 'unparseable' };
  }
  if (parsed.getTime() > receivedAt.getTime() + MAX_CLOCK_SKEW_MS) {
    return { at: receivedAt, replaced: 'future' };
  }
  if (parsed.getTime() < receivedAt.getTime() - MAX_QUEUE_AGE_MS) {
    return { at: receivedAt, replaced: 'too-old' };
  }
  return { at: parsed, replaced: null };
}
