import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateIntervalInformationDTO } from './DTO/interval-information.dto';
import { CreateAssistedUserDTO } from './DTO/assisted-user-dto';
import { CreateGuardianDTO } from './DTO/guardian.dto';
import { SignInDTO } from './DTO/signin.dto';
import { CreateAlertDTO } from './DTO/create-alert.dto';
import { AlertsStreamService } from './services/alerts-stream.service';
import { PushService } from './services/push.service';
import { Between, DataSource, IsNull } from 'typeorm';
import { IntervalInformation } from './entities/interval_information.entity';
import { Device } from './entities/device.entity';
import { Guardian } from './entities/guardian.entity';
import { AssistedUser } from './entities/assisted_user.entity';
import { AlertLog } from './entities/alert_log.entity';
import { GuardianInvite } from './entities/guardian_invite.entity';
import { HttpService } from '@nestjs/axios';
import { normalizeE164 } from './utils/phone';
import {
  generatePairingCode,
  hashPairingCode,
  normalizePairingCode,
} from './utils/device-credentials';
import {
  manilaDate,
  manilaDateMinusDays,
  manilaDayEnd,
  manilaDayStart,
} from './utils/manila-time';
import { clusterVisits } from './utils/geo';
import * as bcrypt from 'bcrypt';

/**
 * How long an invite stays usable. Short on purpose: it travels by text message
 * and lives in that thread forever, so its window should not.
 */
const INVITE_TTL_MS = 30 * 60 * 1000;

/**
 * How far back the history tab can see, in Manila days including today. This is
 * a serving limit only: older alerts are kept, just not returned here.
 */
const ALERT_HISTORY_DAYS = 7;

/** As above, for the location history tab. Also serving-only: nothing is deleted. */
const LOCATION_HISTORY_DAYS = 7;

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World! haha';
  }
  getTry(): string {
    return 'What do you mean by that?';
  }
}

@Injectable()
export class WebService {
  constructor(private readonly dataSource: DataSource) {}

  getBatteryStatus(): string {
    return 'Battery status';
  }

  async getContacts(assistedUserID: number) {
    const guardianRepository = this.dataSource.getRepository(Guardian);
    const guardians = await guardianRepository.find({
      where: { assistedUsers: { id: assistedUserID } },
    });
    return guardians.map((g) => ({
      id: g.id,
      name: g.name,
      role: g.role,
      contactNumber: g.contactNumber,
    }));
  }

  async getAlerts(assistedUserID: number) {
    const alertLogRepository = this.dataSource.getRepository(AlertLog);
    return alertLogRepository.find({
      where: { assistedUser: { id: assistedUserID } },
      order: { occuredAt: 'DESC' },
      take: 5,
    });
  }

  /**
   * The alerts of the last 7 Manila days, newest first, together with the
   * window actually served so the UI can state it without recomputing it.
   *
   * The window is bounded in the query, not in the client: filtering a longer
   * list in the browser would still have shipped the older alerts to it, which
   * makes the limit cosmetic. Nothing is deleted — alerts outside the window
   * stay in the database, they are records of real emergencies.
   */
  async getAlertHistory(assistedUserID: number) {
    const to = manilaDate(new Date());
    const from = manilaDateMinusDays(to, ALERT_HISTORY_DAYS - 1);

    const alerts = await this.dataSource.getRepository(AlertLog).find({
      where: {
        assistedUser: { id: assistedUserID },
        occuredAt: Between(manilaDayStart(from), manilaDayEnd(to)),
      },
      order: { occuredAt: 'DESC' },
    });

    return { from, to, retentionDays: ALERT_HISTORY_DAYS, alerts };
  }

  async assistedUserExists(assistedUserID: number) {
    return this.dataSource
      .getRepository(AssistedUser)
      .existsBy({ id: assistedUserID });
  }

  async getIntervalInformation(assistedUserID: number) {
    const intervalInformationRepository =
      this.dataSource.getRepository(IntervalInformation);
    const intervalInformation = await intervalInformationRepository.find({
      where: { assistedUser: { id: assistedUserID } },
      order: { id: 'DESC' },
      take: 1,
    });
    return intervalInformation;
  }

  /**
   * Where the assisted user has been over the last 7 Manila days, as visits
   * rather than raw readings, oldest first.
   *
   * Same serving rule as the alert history: bounded here, in the query, and
   * nothing is deleted. `createdAt` is the stored column — see the entity; it is
   * set when the report reaches the server, and is surfaced as `recordedAt`.
   */
  async getLocationHistory(assistedUserID: number) {
    const to = manilaDate(new Date());
    const from = manilaDateMinusDays(to, LOCATION_HISTORY_DAYS - 1);

    const samples = await this.dataSource
      .getRepository(IntervalInformation)
      .find({
        where: {
          assistedUser: { id: assistedUserID },
          createdAt: Between(manilaDayStart(from), manilaDayEnd(to)),
        },
        // Oldest first: this is a path through the week, and clustering reads it
        // in order.
        order: { createdAt: 'ASC' },
        select: { latitude: true, longitude: true, createdAt: true },
      });

    // ~20,000 rows in, a few dozen out. The rows themselves stay in the table.
    const visits = clusterVisits(
      samples.map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
        recordedAt: s.createdAt,
      })),
    );

    return { from, to, retentionDays: LOCATION_HISTORY_DAYS, visits };
  }

  async confirmDevice(id: string) {
    const deviceRepository = this.dataSource.getRepository(Device);
    const device = await deviceRepository.findBy({
      id: id,
    });
    if (device.length === 1) return true;
    return false;
  }

  async getDevice(id: string) {
    const deviceRepository = this.dataSource.getRepository(Device);
    const device = await deviceRepository.findBy({
      id: id,
    });
    if (device.length === 0) return false;
    return device[0];
  }

  private mapGuardian(guardian: Guardian) {
    return {
      name: guardian.name,
      assistedUsers: (guardian.assistedUsers ?? []).map((u) => ({
        id: u.id,
        name: u.name,
      })),
      role: guardian.role,
      contactNumber: guardian.contactNumber,
      email: guardian.email,
      username: guardian.username,
    };
  }

  async createGuardian(createGuardianDTO: CreateGuardianDTO) {
    // Store E.164 or nothing: this number is what the wearable dials for
    // emergency SMS, and the modem fails silently on any other format.
    const contactNumber = normalizeE164(createGuardianDTO.contactNumber);
    if (!contactNumber) {
      throw new BadRequestException(
        'contactNumber must be a mobile number that can receive SMS, e.g. 09171234567 or +639171234567',
      );
    }

    const passwordHash = await bcrypt.hash(createGuardianDTO.password, 10);
    const guardianRepository = this.dataSource.getRepository(Guardian);

    try {
      await guardianRepository.save(
        guardianRepository.create({
          name: createGuardianDTO.name,
          role: createGuardianDTO.role,
          contactNumber: contactNumber,
          email: createGuardianDTO.email,
          username: createGuardianDTO.username,
          passwordHash: passwordHash,
        }),
      );
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  /**
   * Claim a device with the pairing code printed in its box, creating the
   * assisted user and making the caller their first guardian.
   *
   * The code proves physical possession of the unit, which is the only thing
   * anyone can prove before an account exists. It works exactly once — after
   * that the printed code is inert and further guardians arrive by invite, so
   * a manual photographed months later grants nothing.
   */
  async createAssistedUser(
    createAssistedUser: CreateAssistedUserDTO,
    guardianID: number,
  ) {
    const name = createAssistedUser?.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const pairingCode =
      typeof createAssistedUser?.pairingCode === 'string'
        ? createAssistedUser.pairingCode
        : '';
    if (!normalizePairingCode(pairingCode)) {
      throw new BadRequestException('pairingCode is required');
    }

    const device = await this.dataSource.getRepository(Device).findOne({
      where: { pairingCodeHash: hashPairingCode(pairingCode) },
      select: { id: true, pairedAt: true, revokedAt: true },
    });

    // One answer for a wrong code, an already-claimed device and a revoked one.
    // The caller is holding a piece of paper; which of those is true is not
    // something they should be able to establish by probing.
    if (!device || device.revokedAt || device.pairedAt) {
      throw new BadRequestException('invalid or already used pairing code');
    }

    const guardianRepository = this.dataSource.getRepository(Guardian);
    const guardian = await guardianRepository.findOne({
      where: { id: guardianID },
      relations: { assistedUsers: true },
    });
    if (!guardian) {
      throw new UnauthorizedException('not signed in');
    }

    return this.dataSource.transaction(async (manager) => {
      // Compare-and-set rather than read-then-write: two people racing with the
      // same code both pass the check above, and only one may pass this.
      const claimed = await manager.update(
        Device,
        { id: device.id, pairedAt: IsNull() },
        { pairedAt: new Date() },
      );
      if (claimed.affected !== 1) {
        throw new BadRequestException('invalid or already used pairing code');
      }

      const assistedUser = await manager.save(
        manager.create(AssistedUser, {
          name,
          device: { id: device.id } as Device,
        }),
      );
      guardian.assistedUsers = [
        ...(guardian.assistedUsers ?? []),
        assistedUser,
      ];
      await manager.save(guardian);

      return { id: assistedUser.id, name: assistedUser.name };
    });
  }

  /**
   * Mint a single-use invite so an existing guardian can add another one.
   *
   * Returns the only copy of the plaintext token — it is stored hashed, so a
   * guardian who loses it mints a new one rather than recovering this.
   */
  async createInvite(assistedUserID: number, guardianID: number) {
    // The caller must already watch this person. Without this check, anyone
    // with an account could mint an invite for any assisted user id they tried.
    const isGuardian = await this.dataSource.getRepository(Guardian).existsBy({
      id: guardianID,
      assistedUsers: { id: assistedUserID },
    });
    if (!isGuardian) {
      throw new ForbiddenException();
    }

    const token = generatePairingCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await this.dataSource.getRepository(GuardianInvite).insert({
      tokenHash: hashPairingCode(token),
      assistedUserId: assistedUserID,
      createdByGuardianId: guardianID,
      expiresAt,
      redeemedAt: null,
      redeemedByGuardianId: null,
    });

    return { token, expiresAt };
  }

  /**
   * Spend an invite, linking the signed-in guardian to the assisted user.
   *
   * Returns the new link plus the guardians who were already watching, so the
   * caller can tell them — a redemption they cannot see is a redemption they
   * cannot dispute.
   */
  async redeemInvite(token: string, guardianID: number) {
    const raw = typeof token === 'string' ? token : '';
    if (!normalizePairingCode(raw)) {
      throw new BadRequestException('token is required');
    }

    const invite = await this.dataSource.getRepository(GuardianInvite).findOne({
      where: { tokenHash: hashPairingCode(raw) },
    });

    // Unknown, expired and already spent are one answer: the token either
    // works right now or it does not.
    if (
      !invite ||
      invite.redeemedAt ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('invalid or expired invite');
    }

    const guardianRepository = this.dataSource.getRepository(Guardian);
    const guardian = await guardianRepository.findOne({
      where: { id: guardianID },
      relations: { assistedUsers: true },
    });
    if (!guardian) {
      throw new UnauthorizedException('not signed in');
    }

    if (guardian.assistedUsers.some((u) => u.id === invite.assistedUserId)) {
      throw new ConflictException('assisted user already linked');
    }

    const assistedUser = await this.dataSource
      .getRepository(AssistedUser)
      .findOne({ where: { id: invite.assistedUserId } });
    if (!assistedUser) {
      throw new BadRequestException('invalid or expired invite');
    }

    // Captured before the link, so the new guardian is not told about himself.
    const existingGuardians = await this.getContacts(assistedUser.id);

    await this.dataSource.transaction(async (manager) => {
      // Same compare-and-set as claiming: single-use has to be enforced by the
      // database, not by the check above, or two redemptions can interleave.
      const spent = await manager.update(
        GuardianInvite,
        { id: invite.id, redeemedAt: IsNull() },
        { redeemedAt: new Date(), redeemedByGuardianId: guardianID },
      );
      if (spent.affected !== 1) {
        throw new BadRequestException('invalid or expired invite');
      }

      guardian.assistedUsers = [...guardian.assistedUsers, assistedUser];
      await manager.save(guardian);
    });

    return {
      assistedUser: { id: assistedUser.id, name: assistedUser.name },
      guardianName: guardian.name,
      notify: existingGuardians.map((g) => g.id),
    };
  }

  async doesUsernameExist(username: string) {
    const guardianRepository = this.dataSource.getRepository(Guardian);

    console.log(username);

    const result = await guardianRepository.existsBy({
      username: username,
    });

    return result;
  }

  async getMe(guardianID: number) {
    const guardianRepository = this.dataSource.getRepository(Guardian);
    const guardian = await guardianRepository.findOne({
      where: { id: guardianID },
      relations: { assistedUsers: true },
    });
    if (!guardian) return null;
    return this.mapGuardian(guardian);
  }

  async signIn(signInDTO: SignInDTO) {
    const guardianRepository = this.dataSource.getRepository(Guardian);
    const guardian = await guardianRepository.findOne({
      where: { username: signInDTO.username },
      relations: { assistedUsers: true },
    });

    if (!guardian) {
      throw new UnauthorizedException('invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      signInDTO.password,
      guardian.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('invalid credentials');
    }

    return { id: guardian.id, ...this.mapGuardian(guardian) };
  }
}

@Injectable()
export class LocationService {
  async reverseGeoCode(latitude: number, longitude: number): Promise<String> {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2`,
      {
        headers: {
          'User-Agent': 'MyRaspberryApp/1.0 mearckfrancisvoughnlol@gmail.com',
        },
      },
    );

    if (!response.ok) {
      console.log(response.status);
      return 'unable to retrieve location';
    }

    const data = await response.json();
    return data.name;
  }
}

@Injectable()
export class RaspberryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly webService: WebService,
    private readonly alertsStreamService: AlertsStreamService,
    private readonly locationService: LocationService,
    private readonly pushService: PushService,
  ) {}

  sendBatteryStatus(): string {
    return 'Battery status';
  }

  /**
   * The numbers the device texts when an alert fires. It is fetched once at
   * startup and cached to disk, because it is needed exactly when the device
   * has no data connection.
   *
   * Returns null for an unknown device or one with no linked assisted user;
   * an assisted user with no guardians yet is an empty list, not an error.
   */
  async getGuardianContacts(deviceID: string) {
    const assistedUser = await this.dataSource
      .getRepository(AssistedUser)
      .findOne({ where: { device: { id: deviceID } } });
    if (!assistedUser) {
      console.warn(`Guardian lookup from unlinked device: ${deviceID}`);
      return null;
    }

    const contacts = await this.webService.getContacts(assistedUser.id);

    // Explicit allowlist, not a blocklist: this response is written to a
    // plaintext cache file on a device that could be lost or stolen, so any
    // field later added to getContacts must not leak by default.
    return contacts.map((c) => {
      // Rows created before contactNumber was validated may not be E.164.
      // Repair what is repairable; pass anything else through untouched and
      // let the device's own normalisation make the final call.
      const normalized = normalizeE164(c.contactNumber);
      if (!normalized) {
        console.warn(
          `Guardian ${c.id} has a non-E.164 contactNumber; the device may be unable to text them`,
        );
      }
      return {
        name: c.name,
        contactNumber: normalized ?? c.contactNumber,
        role: c.role,
      };
    });
  }

  async sendAlert(deviceID: string, dto: CreateAlertDTO) {
    const assistedUser = await this.dataSource
      .getRepository(AssistedUser)
      .findOne({ where: { device: { id: deviceID } } });
    if (!assistedUser) {
      console.warn(`Alert from unlinked device: ${deviceID}`);
      return false;
    }

    const alert = new AlertLog();
    Object.assign(alert, dto);
    alert.assistedUser = assistedUser;

    const saved = await this.dataSource.getRepository(AlertLog).save(alert);

    const location = await this.locationService.reverseGeoCode(
      saved.latitude,
      saved.longitude,
    );

    this.alertsStreamService.publish(assistedUser.id, {
      id: saved.id,
      eventType: saved.eventType,
      latitude: saved.latitude,
      longitude: saved.longitude,
      occuredAt: saved.occuredAt,
      location,
    });

    // The SSE stream only reaches an open page. Push wakes every guardian of
    // this assisted user, whichever of their people they happen to be viewing.
    const guardians = await this.dataSource.getRepository(Guardian).find({
      where: { assistedUsers: { id: assistedUser.id } },
      select: { id: true },
    });

    await Promise.all(
      guardians.map((guardian) =>
        this.pushService.sendAlertPush(guardian.id, {
          alertId: saved.id,
          assistedUserId: assistedUser.id,
          eventType: saved.eventType,
          location: String(location ?? ''),
        }),
      ),
    );

    return true;
  }

  async sendIntervalInformation(
    deviceID: string,
    createIntervalInformationDTO: CreateIntervalInformationDTO,
  ) {
    const assistedUser = await this.dataSource
      .getRepository(AssistedUser)
      .findOne({
        where: { device: { id: deviceID } },
      });

    if (!assistedUser) {
      console.warn(`Interval information from unlinked device: ${deviceID}`);
      return false;
    }

    const intervalInformation = new IntervalInformation();
    Object.assign(intervalInformation, createIntervalInformationDTO);
    intervalInformation.assistedUser = assistedUser;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(intervalInformation);
      await queryRunner.commitTransaction();
      return true;
    } catch (e) {
      console.error(e);
      await queryRunner.rollbackTransaction();
      return false;
    } finally {
      await queryRunner.release();
    }
  }
}
