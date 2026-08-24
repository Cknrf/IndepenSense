import {
  BadRequestException,
  ConflictException,
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
import { DataSource } from 'typeorm';
import { IntervalInformation } from './entities/interval_information.entity';
import { Device } from './entities/device.entity';
import { Guardian } from './entities/guardian.entity';
import { AssistedUser } from './entities/assisted_user.entity';
import { AlertLog } from './entities/alert_log.entity';
import { HttpService } from '@nestjs/axios';
import { normalizeE164 } from './utils/phone';
import * as bcrypt from 'bcrypt';

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

  async linkAssistedUser(deviceID: string, guardianID: number) {
    const assistedUserRepository = this.dataSource.getRepository(AssistedUser);
    const guardianRepository = this.dataSource.getRepository(Guardian);

    const assistedUser = await assistedUserRepository.findOne({
      where: { device: { id: deviceID } },
    });
    if (!assistedUser) return null;

    const guardian = await guardianRepository.findOne({
      where: { id: guardianID },
      relations: { assistedUsers: true },
    });
    if (!guardian) return null;

    if (guardian.assistedUsers.some((u) => u.id === assistedUser.id)) {
      throw new ConflictException('assisted user already linked');
    }

    guardian.assistedUsers = [...guardian.assistedUsers, assistedUser];

    try {
      await guardianRepository.save(guardian);
      return { id: assistedUser.id, name: assistedUser.name };
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async createAssistedUser(
    createAssistedUser: CreateAssistedUserDTO,
    guardianID: number,
  ) {
    const device = await this.getDevice(createAssistedUser.deviceID);
    if (!device) {
      return null;
    }

    const guardianRepository = this.dataSource.getRepository(Guardian);
    const guardian = await guardianRepository.findOne({
      where: { id: guardianID },
      relations: { assistedUsers: true },
    });
    if (!guardian) {
      return null;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const assistedUser = await manager.save(
          manager.create(AssistedUser, {
            name: createAssistedUser.name,
            device,
          }),
        );
        guardian.assistedUsers = [
          ...(guardian.assistedUsers ?? []),
          assistedUser,
        ];
        await manager.save(guardian);
        return { id: assistedUser.id, name: assistedUser.name };
      });
    } catch (e) {
      console.error(e);
      return null;
    }
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

  async sendAlert(dto: CreateAlertDTO) {
    const assistedUser = await this.dataSource
      .getRepository(AssistedUser)
      .findOne({ where: { device: { id: dto.deviceID } } });
    if (!assistedUser) {
      console.warn(`Alert from unlinked device: ${dto.deviceID}`);
      return false;
    }

    const { deviceID, ...rest } = dto;
    const alert = new AlertLog();
    Object.assign(alert, rest);
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
    createIntervalInformationDTO: CreateIntervalInformationDTO,
  ) {
    const assistedUser = await this.dataSource
      .getRepository(AssistedUser)
      .findOne({
        where: { device: { id: createIntervalInformationDTO.deviceID } },
      });

    if (!assistedUser) {
      console.warn(
        `Interval information from unlinked device: ${createIntervalInformationDTO.deviceID}`,
      );
      return false;
    }

    const { deviceID, ...rest } = createIntervalInformationDTO;
    const intervalInformation = new IntervalInformation();
    Object.assign(intervalInformation, rest);
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

