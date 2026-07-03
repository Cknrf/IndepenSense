import { Inject, Injectable } from '@nestjs/common';
import { CreateIntervalInformationDTO } from './DTO/interval-information.dto';
import { DataSource } from 'typeorm';
import { IntervalInformation } from './entities/interval_information.entity';
import { HttpService} from '@nestjs/axios';

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
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2`, 
      {
        headers: {
          "User-Agent": "MyRaspberryApp/1.0 mearckfrancisvoughnlol@gmail.com",
        },
      },
    );

    if(!response.ok) {
      console.log(response.status);
      return "unable to retrieve location";
    }

    const data = await response.json();
    return data.name;
  }
}

