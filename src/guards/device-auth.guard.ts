import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Device } from '../entities/device.entity';
import { matchesHash } from '../utils/device-credentials';

/** How stale lastSeenAt may get before we spend a write refreshing it. */
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

interface DeviceCredential {
  deviceId: string;
  secret: string;
}

/**
 * `Authorization: Bearer <deviceId>.<secret>`
 *
 * The id says which row to check against; the secret proves the caller is that
 * device. Neither half is useful alone — an id with no secret is just the
 * number printed on a box, and a secret against the wrong id is compared to a
 * different row's hash and fails.
 */
function parseCredential(header: string | undefined): DeviceCredential | null {
  if (!header) return null;

  const [scheme, value, ...rest] = header.split(' ');
  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }

  // A uuid contains no '.', and the secret is base64url, so the first dot is
  // unambiguously the separator.
  const separator = value.indexOf('.');
  if (separator <= 0 || separator === value.length - 1) return null;

  return {
    deviceId: value.slice(0, separator),
    secret: value.slice(separator + 1),
  };
}

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const credential = parseCredential(req.header('authorization'));
    if (!credential) {
      throw new UnauthorizedException('invalid device credential');
    }

    const deviceRepository = this.dataSource.getRepository(Device);
    const device = await deviceRepository.findOne({
      where: { id: credential.deviceId },
      // secretHash is `select: false`, so it has to be asked for by name. Keep
      // this list minimal: the fewer places the hash is loaded, the fewer
      // places it can be logged or serialised by accident.
      select: {
        id: true,
        secretHash: true,
        revokedAt: true,
        lastSeenAt: true,
      },
    });

    // One message for every failure mode. Whoever is probing this endpoint must
    // not learn whether an id exists, is revoked, or merely had a bad secret.
    if (!device?.secretHash || device.revokedAt) {
      throw new UnauthorizedException('invalid device credential');
    }

    if (!matchesHash(credential.secret, device.secretHash)) {
      throw new UnauthorizedException('invalid device credential');
    }

    // Never let the verified hash travel any further than this guard.
    delete (device as Partial<Device>).secretHash;
    req.device = device;

    this.touchLastSeen(device);
    return true;
  }

  /**
   * Telemetry, not authorisation. Rate limited to one write per device per
   * LAST_SEEN_REFRESH_MS so a device posting every few seconds does not double
   * its database writes, and deliberately not awaited — a bookkeeping failure
   * must never reject a real fall alert.
   */
  private touchLastSeen(device: Device): void {
    const now = new Date();
    if (
      device.lastSeenAt &&
      now.getTime() - device.lastSeenAt.getTime() < LAST_SEEN_REFRESH_MS
    ) {
      return;
    }

    void this.dataSource
      .getRepository(Device)
      .update(device.id, { lastSeenAt: now })
      .catch((e) => console.error('failed to update device lastSeenAt', e));
  }
}
