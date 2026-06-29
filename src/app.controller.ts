import { Controller, Get, Post, Req, Res, Body} from '@nestjs/common';
import { AppService, WebService, RaspberryService } from './app.service';
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
  constructor(private readonly webService: WebService) {}

  @Get('battery-status')
  getBatteryStatus(): string {
    return this.webService.getBatteryStatus();
  }
}

@Controller('raspberry')
export class RaspberryController {
  constructor(private readonly raspberryService: RaspberryService) {}

  @Get('get-interval-information')
  getIntervalInformation() {
    console.log(this.raspberryService.getIntervalInformation());
    return this.raspberryService.getIntervalInformation();
  }

  @Post('interval-information')
  sendIntervalInformation(@Body() createIntervalInformationDTO: CreateIntervalInformationDTO, @Req() req: Request ): string{
    console.log(createIntervalInformationDTO);

    this.raspberryService.sendIntervalInformation(createIntervalInformationDTO);
    return "successful";
  }

}
