import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  Body,
  Param,
  ParseIntPipe,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from './guards/session-auth.guard';
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

  @UseGuards(SessionAuthGuard)
  @Get('contacts/:assistedUserID')
  async getContacts(
    @Param('assistedUserID', ParseIntPipe) assistedUserID: number,
    @Req() req: Request,
  ) {
    const contacts = await this.webService.getContacts(assistedUserID);
    if (!contacts.some((c) => c.id === req.session.guardianID)) {
      throw new ForbiddenException();
    }
    return contacts.map(({ id, ...rest }) => rest);
  }

  @UseGuards(SessionAuthGuard)
  @Get('alerts/:assistedUserID')
  async getAlerts(
    @Param('assistedUserID', ParseIntPipe) assistedUserID: number,
  ) {
    const alerts = await this.webService.getAlerts(assistedUserID);

    return Promise.all(
      alerts.map(async (a) => ({
        ...a,
        location: await this.locationService.reverseGeoCode(
          a.latitude,
          a.longitude,
        ),
      })),
    );
  }

  @UseGuards(SessionAuthGuard)
  @Get('interval-information/:assistedUserID')
  async getIntervalInformation(
    @Param('assistedUserID', ParseIntPipe) assistedUserID: number,
  ) {
    const data = await this.webService.getIntervalInformation(assistedUserID);
    if (!data.length) return null;

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
    if (!result) {
      throw new BadRequestException('account creation failed');
    }
    return { message: 'account creation successed', status: true };
  }

  @UseGuards(SessionAuthGuard)
  @Post('create-assisted-user-account')
  async createAssistedUser(
    @Body() createAssistedUserDTO: CreateAssistedUserDTO,
    @Req() req: Request,
  ) {
    const assistedUser = await this.webService.createAssistedUser(
      createAssistedUserDTO,
      req.session.guardianID!,
    );
    if (!assistedUser) {
      throw new BadRequestException('account creation failed');
    }
    return assistedUser;
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
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie('connect.sid');
    return { message: 'signed out' };
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const guardian = await this.webService.getMe(req.session.guardianID!);
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
  async sendIntervalInformation(
    @Body() createIntervalInformationDTO: CreateIntervalInformationDTO,
  ) {
    const ok = await this.raspberryService.sendIntervalInformation(
      createIntervalInformationDTO,
    );
    if (!ok) {
      throw new BadRequestException('unknown or unlinked device');
    }
    return 'successful';
  }
}
