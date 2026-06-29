import { Injectable } from '@nestjs/common';
import { CreateIntervalInformationDTO } from './DTO/interval-information.dto';
import { DataSource } from 'typeorm';
import { IntervalInformation } from './entities/interval_information.entity';
import { query } from 'axios';

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
  getBatteryStatus(): string {
    return 'Battery status';
  }
}

@Injectable()
export class RaspberryService {
  constructor(private readonly dataSource: DataSource) {}

  sendBatteryStatus(): string {
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
