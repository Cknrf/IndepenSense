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
  /** First sample of the visit — when they arrived. */
  recordedAt: Date;
  /** Last sample of the visit. With recordedAt this gives the dwell time. */
  lastSeenAt: Date;
  /** How many raw readings this visit was built from. */
  sampleCount: number;
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
 * How many consecutive out-of-radius samples to tolerate before believing the
 * person actually left.
 *
 * A stationary GPS throws the occasional wild fix, and without this one bad
 * reading splits a morning at home into two visits either side of it — the same
 * place, listed twice, with its dwell time cut in half. A real departure never
 * looks like this: it produces out-of-radius samples continuously, so it trips
 * the tolerance immediately.
 */
const OUTLIER_TOLERANCE_SAMPLES = 2;

interface Cluster {
  latitudeSum: number;
  longitudeSum: number;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

const startCluster = (sample: Sample): Cluster => ({
  latitudeSum: sample.latitude,
  longitudeSum: sample.longitude,
  count: 1,
  firstAt: sample.recordedAt,
  lastAt: sample.recordedAt,
});

const extendCluster = (cluster: Cluster, sample: Sample) => {
  cluster.latitudeSum += sample.latitude;
  cluster.longitudeSum += sample.longitude;
  cluster.count += 1;
  cluster.lastAt = sample.recordedAt;
};

/**
 * Collapse a chronological run of location samples into the visits it implies.
 *
 * At a 30s reporting interval a week of raw samples is ~20,000 rows and well
 * over a megabyte of JSON; the visits behind them are a few dozen. The web
 * client clusters with these same thresholds and leaves already-distinct visits
 * alone, so doing it here changes the payload, not the picture.
 *
 * `samples` must be ordered oldest first.
 */
export function clusterVisits(samples: Sample[]): Visit[] {
  const visits: Visit[] = [];

  let current: Cluster | null = null;
  // Samples that fell outside the radius but have not yet convinced us that the
  // person left. Either the next in-radius sample reclaims them as jitter, or
  // they become the start of the next visit.
  let pending: Sample[] = [];

  const close = (cluster: Cluster | null, isNewest: boolean) => {
    if (!cluster) return;
    const lasted = cluster.lastAt.getTime() - cluster.firstAt.getTime();
    // The newest cluster is kept however brief. A guardian opening the screen
    // to see where the person is now would otherwise find nothing there for the
    // first five minutes after they arrive somewhere.
    if (lasted < MIN_VISIT_MS && !isNewest) return;
    visits.push({
      latitude: cluster.latitudeSum / cluster.count,
      longitude: cluster.longitudeSum / cluster.count,
      recordedAt: cluster.firstAt,
      lastSeenAt: cluster.lastAt,
      sampleCount: cluster.count,
    });
  };

  const restartFrom = (buffered: Sample[]): Cluster => {
    const cluster = startCluster(buffered[0]);
    for (const sample of buffered.slice(1)) extendCluster(cluster, sample);
    return cluster;
  };

  for (const sample of samples) {
    if (!current) {
      current = startCluster(sample);
      continue;
    }

    // Measured against the visit's centre, not against the previous sample.
    // Chaining sample-to-sample would fuse an entire slow walk into one "visit"
    // — every step is within 75 m of the last — which is exactly the stop that
    // isn't there.
    const inRadius =
      distanceMeters(
        current.latitudeSum / current.count,
        current.longitudeSum / current.count,
        sample.latitude,
        sample.longitude,
      ) <= VISIT_RADIUS_M;

    if (inRadius) {
      // Whatever was buffered was jitter after all: it belongs to this visit,
      // and so does the gap it would otherwise have torn open.
      for (const buffered of pending) extendCluster(current, buffered);
      pending = [];
      extendCluster(current, sample);
      continue;
    }

    pending.push(sample);
    if (pending.length > OUTLIER_TOLERANCE_SAMPLES) {
      close(current, false);
      current = restartFrom(pending);
      pending = [];
    }
  }

  // Anything still buffered is the newest thing known about this person, and
  // unresolved: it may be the first minute of a departure. Emit it rather than
  // lose it, under the same newest-cluster exemption.
  if (pending.length) {
    close(current, false);
    close(restartFrom(pending), true);
  } else {
    close(current, true);
  }

  return visits;
}
