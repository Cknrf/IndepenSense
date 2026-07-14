import { Controller, Get, Post, Req, Res, Body } from '@nestjs/common';
import {
  AppService,
  WebService,
  RaspberryService,
  LocationService,
} from './app.service';
import type { Request, Response } from 'express';
import { CreateIntervalInformationDTO } from './DTO/interval-information.dto';
import { CreateDeviceDTO } from './DTO/device.dto';
import { CreateGuardianDTO } from './DTO/guardian.dto';
import { CreateAssistedUserDTO } from './DTO/assisted-user-dto';
import { SignInDTO } from './DTO/signin.dto';

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

  @Get('interval-information')
  async getIntervalInformation() {
    const data = await this.webService.getIntervalInformation();

    const location = await this.locationService.reverseGeoCode(
      data[0].latitude,
      data[0].longitude,
    );
    return { ...data[0], location };
  }

  @Post('device-confirmation')
  async confirmDevice(@Body() createDeviceDTO: CreateDeviceDTO) {
    const isValid = await this.webService.confirmDevice(createDeviceDTO.id);
    console.log('Is device valid: ' + isValid);
    return isValid;
  }

  @Post('create-guardian-account')
  async createGuardian(@Body() createGuardianDTO: CreateGuardianDTO) {
    const result = await this.webService.createGuardian(createGuardianDTO);
    return { message: 'successfull' };
  }

  @Post('create-assisted-user-account')
  async createAssistedUser(
    @Body() createAssistedUserDTO: CreateAssistedUserDTO,
  ) {
    const result = await this.webService.createAssistedUser(
      createAssistedUserDTO,
    );
    if (!result) {
      return { message: 'account creation failed', status: false };
    }
    return { message: 'account creation successed', status: true };
  }

  @Post('does-username-exist')
  async doesUsernameExist(@Body() body: { username: string }) {
    const result = await this.webService.doesUsernameExist(body.username);
    console.log('Does user exist:' + result);
    return result;
  }

  @Post('signin')
  async signIn(@Body() signInDTO: SignInDTO) {
    return this.webService.signIn(signInDTO);
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
