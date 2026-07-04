import { Controller, Get, Post, Req, Res, Body } from '@nestjs/common';
import {
  AppService,
  WebService,
  RaspberryService,
  LocationService,
} from './app.service';
import type { Request, Response } from 'express';
import { CreateIntervalInformationDTO } from './DTO/interval-information.dto';
import { IntervalInformation } from './entities/interval_information.entity';

@Controller('main')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('try')
  getTry(): string {
    return this.appService.getTry();
  }
}

@Controller('web')
export class WebController {
  constructor(
    private readonly webService: WebService,
    private readonly locationService: LocationService,
  ) {}

  @Get('get-interval-information')
  async getIntervalInformation() {
    const data = await this.webService.getIntervalInformation();

    const location = await this.locationService.reverseGeoCode(
      data[0].latitude,
      data[0].longitude,
    );
    return { ...data[0], location };
  }
}

@Controller('raspberry')
export class RaspberryController {
  constructor(
    private readonly raspberryService: RaspberryService,
    private readonly locationService: LocationService,
  ) {}

  @Post('interval-information')
  sendIntervalInformation(
    @Body() createIntervalInformationDTO: CreateIntervalInformationDTO,
    @Req() req: Request,
  ): string {
    console.log(createIntervalInformationDTO);

    this.raspberryService.sendIntervalInformation(createIntervalInformationDTO);
    return 'successful';
  }
}
