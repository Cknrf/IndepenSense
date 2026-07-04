import { Inject, Injectable } from '@nestjs/common';
import { CreateIntervalInformationDTO } from './DTO/interval-information.dto';
import { CreateGuardianDTO } from './DTO/guardian.dto';
import { DataSource } from 'typeorm';
import { IntervalInformation } from './entities/interval_information.entity';
import { Device } from './entities/device.entity';
import { Guardian } from './entities/guardian.entity';
import { HttpService } from '@nestjs/axios';
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

  async getIntervalInformation() {
    const intervalInformationRepository =
      this.dataSource.getRepository(IntervalInformation);
    const intervalInformation = await intervalInformationRepository.find({
      order: {
        id: 'DESC',
      },
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

  async createGuardian(createGuardianDTO: CreateGuardianDTO) {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(
      createGuardianDTO.password,
      saltRounds,
    );
    const deviceRepository = this.dataSource.getRepository(Guardian);

    const device = deviceRepository.create({
      name: createGuardianDTO.name,
      role: createGuardianDTO.role,
      contactNumber: createGuardianDTO.contactNumber,
      email: createGuardianDTO.email,
      username: createGuardianDTO.username,
      passwordHash: passwordHash,
    });

    const result = await deviceRepository.save(device);

    console.log(result);
  }
}

@Injectable()
export class RaspberryService {
  constructor(private readonly dataSource: DataSource) {}

  sendBatteryStatus(): string {
    return 'Battery status';
  }

  async sendIntervalInformation(
    createIntervalInformationDTO: CreateIntervalInformationDTO,
  ) {
    const intervalInformation = new IntervalInformation();
    Object.assign(intervalInformation, createIntervalInformationDTO);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(intervalInformation);
      await queryRunner.commitTransaction();
    } catch (e) {
      console.error(e);
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
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
