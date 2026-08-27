/** Metres between two WGS84 points, by haversine. */
export function distanceMeters(
  aLatitude: number,
  aLongitude: number,
  bLatitude: number,
  bLongitude: number,
): number {
  const EARTH_RADIUS_M = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(bLatitude - aLatitude);
  const dLon = toRad(bLongitude - aLongitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLatitude)) *
      Math.cos(toRad(bLatitude)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A place the assisted user stayed for a while, not a single reading. */
export interface Visit {
  latitude: number;
  longitude: number;
  recordedAt: Date;
}

interface Sample {
  latitude: number;
  longitude: number;
  recordedAt: Date;
}

/** Samples further apart than this start a new visit. */
const VISIT_RADIUS_M = 75;

/** Anything shorter than this was passing through, not a stay. */
const MIN_VISIT_MS = 5 * 60 * 1000;

/**
 * Collapse a chronological run of location samples into the visits it implies.
 *
 * At a 30s reporting interval a week of raw samples is ~20,000 rows and well
 * over a megabyte of JSON; the visits behind them are a few dozen. The web
 * client clusters with these same two thresholds and leaves already-distinct
 * visits alone, so doing it here changes the payload, not the picture.
 *
 * `samples` must be ordered oldest first. Each visit carries the mean
 * coordinate of its samples and the timestamp of its first, so the result reads
 * as "arrived here, at this time".
 */
export function clusterVisits(samples: Sample[]): Visit[] {
  const visits: Visit[] = [];

  // Accumulated sums, so the centroid can be updated per sample without
  // keeping every member around.
  let latitudeSum = 0;
  let longitudeSum = 0;
  let count = 0;
  let centroidLatitude = 0;
  let centroidLongitude = 0;
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;

  const close = () => {
    // A visit needs a real duration to count. A single sample spans no time, so
    // it falls out here too.
    if (
      firstAt &&
      lastAt &&
      lastAt.getTime() - firstAt.getTime() >= MIN_VISIT_MS
    ) {
      visits.push({
        latitude: latitudeSum / count,
        longitude: longitudeSum / count,
        recordedAt: firstAt,
      });
    }
  };

  for (const sample of samples) {
    // Measured against the visit's centre, not against the previous sample.
    // Chaining sample-to-sample would fuse an entire slow walk into one "visit"
    // — every step is within 75 m of the last one — which is exactly the stop
    // that isn't there.
    const belongsHere =
      count > 0 &&
      distanceMeters(
        centroidLatitude,
        centroidLongitude,
        sample.latitude,
        sample.longitude,
      ) <= VISIT_RADIUS_M;

    if (!belongsHere) {
      close();
      latitudeSum = 0;
      longitudeSum = 0;
      count = 0;
      firstAt = sample.recordedAt;
    }

    latitudeSum += sample.latitude;
    longitudeSum += sample.longitude;
    count += 1;
    centroidLatitude = latitudeSum / count;
    centroidLongitude = longitudeSum / count;
    lastAt = sample.recordedAt;
  }
  close();

  return visits;
}
