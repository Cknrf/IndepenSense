// A "day" in this system is a day in the Philippines, because that is where the
// device and the assisted user are. A guardian reading the history from abroad
// must see the same day buckets as one reading it at home, so neither UTC nor
// the caller's clock is used anywhere below.
//
// The Philippines has been UTC+8 with no daylight saving since 1942, and has no
// scheduled change, so a fixed offset is exact here — the tz database would add
// a dependency and buy nothing.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The Manila calendar date of an instant, as YYYY-MM-DD.
 *
 * 2026-08-27T15:30:00Z is 23:30 in Manila, so it is still 2026-08-27;
 * 2026-08-27T16:30:00Z is 00:30 the next morning, so it is 2026-08-28.
 */
export function manilaDate(instant: Date): string {
  // Shifting the instant and then reading its UTC parts is how the offset gets
  // applied without a tz library: the shifted clock reads Manila wall time.
  return new Date(instant.getTime() + MANILA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** The instant a Manila calendar date begins: `date` 00:00:00.000+08:00. */
export function manilaDayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000+08:00`);
}

/** The last instant of a Manila calendar date: `date` 23:59:59.999+08:00. */
export function manilaDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999+08:00`);
}

/** The Manila calendar date `days` days before `date`. */
export function manilaDateMinusDays(date: string, days: number): string {
  // Anchored at 00:00 Manila, so subtracting whole days lands on 00:00 Manila
  // of an earlier day and cannot slip across a boundary.
  return manilaDate(
    new Date(manilaDayStart(date).getTime() - days * MS_PER_DAY),
  );
}
