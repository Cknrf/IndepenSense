import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
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
  async signIn(@Body() signInDTO: SignInDTO, @Req() req: Request) {
    const { id, ...guardian } = await this.webService.signIn(signInDTO);
    req.session.guardianID = id;
    return guardian;
  }

  @Post('signout')
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie('connect.sid');
    return { message: 'signed out' };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const guardianID = req.session.guardianID;
    if (!guardianID) {
      throw new UnauthorizedException('not signed in');
    }
    const guardian = await this.webService.getMe(guardianID);
    if (!guardian) {
      await new Promise<void>((resolve) => {
        req.session.destroy(() => resolve());
      });
      throw new UnauthorizedException('not signed in');
    }
    return guardian;
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
