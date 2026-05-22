import { Controller, Get, Post } from '@nestjs/common';
import { AppService, WebService, RaspberryService } from './app.service';

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

  @Post('battery-status')
  getBatteryStatus(): string {
    return this.raspberryService.sendBatteryStatus();
  }
}
