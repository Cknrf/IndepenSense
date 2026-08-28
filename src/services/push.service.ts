import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JWT } from 'google-auth-library';
import * as webpush from 'web-push';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DeviceToken, PushPlatform } from '../entities/device_token.entity';
import { PushTokenDTO } from '../DTO/push-token.dto';

const PLATFORMS: PushPlatform[] = ['fcm', 'webpush'];

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * The channels the client creates (see pushNative.ts in the web repo). A
 * notification sent to any id the client does not create arrives silently.
 *
 * ALERTS is importance 5: heads-up, vibration — right for a fall, wrong for
 * everything else. SECURITY is importance 4, no vibration: it still arrives
 * promptly, it just does not imitate an emergency.
 */
const ANDROID_CHANNEL_ALERTS = 'indepensense-alerts';
const ANDROID_CHANNEL_SECURITY = 'indepensense-security';

/** What a guardian's device is told about an alert, on either transport. */
export interface AlertPushPayload {
  alertId: number;
  assistedUserId: number;
  eventType: string;
  location: string;
}

/** Sent to the guardians who were already watching, when one more joins. */
export interface GuardianAddedPayload {
  assistedUserId: number;
  assistedUserName: string;
  guardianName: string;
}

/**
 * A notification in transport-neutral form. `data` keeps real JSON types; only
 * the FCM leg flattens it, because FCM rejects any non-string data value.
 */
interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string | number>;
  /** Which Android channel this arrives on — see the constants above. */
  channelId: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  private vapidPublicKey: string | null = null;
  private fcmClient: JWT | null = null;
  private fcmProjectId: string | null = null;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.configureWebPush();
    this.configureFcm();
  }

  // ---------------------------------------------------------------- config

  private configureWebPush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject =
      process.env.VAPID_SUBJECT?.trim() ??
      'mailto:mearckfrancisvoughnlol@gmail.com';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — web push is disabled',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.vapidPublicKey = publicKey;
    this.logger.log('Web push configured');
  }

  private configureFcm() {
    const credentials = this.loadServiceAccount();
    if (!credentials) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT not set — FCM push is disabled',
      );
      return;
    }

    const { client_email, private_key, project_id } = credentials;
    if (!client_email || !private_key || !project_id) {
      this.logger.error(
        'Firebase service account is missing client_email, private_key or project_id — FCM push is disabled',
      );
      return;
    }

    this.fcmProjectId = project_id;
    this.fcmClient = new JWT({
      email: client_email,
      // Survives the common case of the key being stored with escaped newlines.
      key: private_key.replace(/\\n/g, '\n'),
      scopes: [FCM_SCOPE],
    });
    this.logger.log(`FCM configured for project ${project_id}`);
  }

  /**
   * The service account may arrive as raw JSON, as base64 (friendlier to
   * single-line env vars), or as a path to a mounted file.
   */
  private loadServiceAccount(): Record<string, string> | null {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

    let json: string | undefined;
    try {
      if (inline) {
        json = inline.startsWith('{')
          ? inline
          : Buffer.from(inline, 'base64').toString('utf8');
      } else if (path) {
        json = readFileSync(path, 'utf8');
      }
    } catch (e) {
      this.logger.error('Unable to read the Firebase service account', e);
      return null;
    }

    if (!json) return null;

    try {
      return JSON.parse(json) as Record<string, string>;
    } catch {
      this.logger.error(
        'Firebase service account is not valid JSON (expected raw JSON or base64)',
      );
      return null;
    }
  }

  // ------------------------------------------------------------ public API

  getVapidPublicKey(): string {
    if (!this.vapidPublicKey) {
      throw new ServiceUnavailableException('web push is not configured');
    }
    return this.vapidPublicKey;
  }

  /**
   * Bind a token to a guardian, or refresh it if it is already known.
   *
   * A device can be handed between accounts, so an existing token re-registered
   * by a different guardian MOVES rather than duplicating — otherwise the old
   * owner would keep receiving alerts about someone they no longer watch.
   */
  async register(guardianID: number, dto: PushTokenDTO) {
    const { platform, token } = this.validate(dto);

    await this.dataSource
      .getRepository(DeviceToken)
      .createQueryBuilder()
      .insert()
      .values({
        guardianId: guardianID,
        platform,
        token,
        tokenHash: hashToken(token),
        lastSeenAt: new Date(),
      })
      // Column names here are emitted into the SQL verbatim, so they are the
      // database names rather than the entity properties.
      .orUpdate(['guardian_id', 'last_seen_at'], ['platform', 'token_hash'])
      // repository.upsert() would throw here: MySQL reports insertId 0 when the
      // row was updated rather than inserted, and TypeORM then fails trying to
      // map a generated id back onto the entity.
      .updateEntity(false)
      .execute();
  }

  /** Drop a token, but only if it belongs to the caller. */
  async unregister(guardianID: number, dto: PushTokenDTO) {
    const { platform, token } = this.validate(dto);

    await this.dataSource.getRepository(DeviceToken).delete({
      guardianId: guardianID,
      platform,
      tokenHash: hashToken(token),
    });
  }

  /**
   * Fan an alert out to every device the guardian has registered.
   *
   * Never throws: a push failure must not fail the alert that triggered it.
   */
  async sendAlertPush(guardianID: number, alert: AlertPushPayload) {
    await this.send(guardianID, {
      title: alert.eventType,
      body: alert.location,
      channelId: ANDROID_CHANNEL_ALERTS,
      data: {
        type: 'alert',
        alertId: alert.alertId,
        assistedUserId: alert.assistedUserId,
        eventType: alert.eventType,
        location: alert.location,
      },
    });
  }

  /**
   * Tell the existing guardians that someone else now watches this person.
   *
   * This is the part that makes a leaked invite survivable: it cannot be
   * redeemed quietly. Prevention is the single-use, 30-minute token; this is
   * the detection behind it.
   */
  async sendGuardianAddedPush(
    guardianID: number,
    notice: GuardianAddedPayload,
  ) {
    await this.send(guardianID, {
      title: 'New guardian added',
      body: `${notice.guardianName} can now see ${notice.assistedUserName}.`,
      // Important to see, but it is not an emergency: someone joining should
      // not buzz like a fall at 3am.
      channelId: ANDROID_CHANNEL_SECURITY,
      data: {
        type: 'guardian-added',
        assistedUserId: notice.assistedUserId,
        assistedUserName: notice.assistedUserName,
        guardianName: notice.guardianName,
      },
    });
  }

  /** Fan one message out to every device the guardian has registered. */
  private async send(guardianID: number, message: PushMessage) {
    let tokens: DeviceToken[];
    try {
      tokens = await this.dataSource
        .getRepository(DeviceToken)
        .findBy({ guardianId: guardianID });
    } catch (e) {
      this.logger.error(`Unable to load push tokens for ${guardianID}`, e);
      return;
    }

    await Promise.all(
      tokens.map(async (row) => {
        try {
          if (row.platform === 'fcm') await this.sendFcm(row, message);
          else await this.sendWebPush(row, message);
        } catch (e) {
          this.logger.error(`Push to token ${row.id} failed`, e);
        }
      }),
    );
  }

  // -------------------------------------------------------------- FCM leg

  private async sendFcm(row: DeviceToken, message: PushMessage) {
    if (!this.fcmClient || !this.fcmProjectId) return;

    const { token: accessToken } = await this.fcmClient.getAccessToken();
    if (!accessToken) {
      this.logger.error('Unable to mint an FCM access token');
      return;
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.fcmProjectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: { title: message.title, body: message.body },
            android: {
              priority: 'high',
              notification: { channel_id: message.channelId },
            },
            // FCM rejects the whole message if any data value is not a string.
            data: Object.fromEntries(
              Object.entries(message.data).map(([k, v]) => [k, String(v)]),
            ),
          },
        }),
      },
    );

    if (response.ok) return;

    const body = await response.text();
    if (isFcmTokenDead(response.status, body)) {
      await this.prune(row, `FCM reports it dead (${response.status})`);
      return;
    }
    this.logger.error(
      `FCM rejected token ${row.id}: ${response.status} ${body}`,
    );
  }

  // --------------------------------------------------------- Web Push leg

  private async sendWebPush(row: DeviceToken, message: PushMessage) {
    if (!this.vapidPublicKey) return;

    let subscription: webpush.PushSubscription;
    try {
      subscription = JSON.parse(row.token) as webpush.PushSubscription;
    } catch {
      await this.prune(row, 'stored subscription is not valid JSON');
      return;
    }

    try {
      await webpush.sendNotification(
        subscription,
        // Unlike FCM, Web Push keeps the real JSON types.
        JSON.stringify({
          title: message.title,
          body: message.body,
          data: message.data,
        }),
      );
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.prune(row, `subscription is gone (${status})`);
        return;
      }
      throw e;
    }
  }

  // --------------------------------------------------------------- shared

  /**
   * Drop a token the transport has told us is dead. Without this, stale tokens
   * accumulate forever and every alert fans out to garbage.
   */
  private async prune(row: DeviceToken, reason: string) {
    this.logger.log(`Pruning ${row.platform} token ${row.id}: ${reason}`);
    try {
      await this.dataSource.getRepository(DeviceToken).delete({ id: row.id });
    } catch (e) {
      this.logger.error(`Unable to prune token ${row.id}`, e);
    }
  }

  /** There is no global ValidationPipe, so the body is checked by hand. */
  private validate(dto: PushTokenDTO): PushTokenDTO {
    const platform = dto?.platform;
    const token = dto?.token;

    if (!PLATFORMS.includes(platform)) {
      throw new BadRequestException(
        `platform must be one of ${PLATFORMS.join(', ')}`,
      );
    }
    if (typeof token !== 'string' || !token.trim()) {
      throw new BadRequestException('token must be a non-empty string');
    }
    if (platform === 'webpush' && !isPushSubscription(token)) {
      throw new BadRequestException(
        'token must be a JSON-stringified PushSubscription',
      );
    }

    return { platform, token };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isPushSubscription(token: string): boolean {
  try {
    const parsed = JSON.parse(token) as { endpoint?: unknown; keys?: unknown };
    return typeof parsed?.endpoint === 'string' && !!parsed?.keys;
  } catch {
    return false;
  }
}

/**
 * FCM signals a dead token with HTTP 404, or with an UNREGISTERED error code.
 * Deliberately narrow: a misconfiguration must not be read as "prune the row".
 */
function isFcmTokenDead(status: number, body: string): boolean {
  if (status === 404) return true;
  try {
    const parsed = JSON.parse(body) as {
      error?: { details?: { errorCode?: string }[] };
    };
    const details = parsed?.error?.details;
    return (
      Array.isArray(details) &&
      details.some((d) => d?.errorCode === 'UNREGISTERED')
    );
  } catch {
    return false;
  }
}
