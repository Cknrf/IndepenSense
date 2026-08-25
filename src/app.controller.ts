import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  MessageEvent,
  Post,
  Req,
  Res,
  Body,
  Param,
  ParseIntPipe,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { DeviceAuthGuard } from './guards/device-auth.guard';
import {
  AppService,
  WebService,
  RaspberryService,
  LocationService,
} from './app.service';
import { AlertsStreamService } from './services/alerts-stream.service';
import { PushService } from './services/push.service';
import type { Request, Response } from 'express';
import { CreateIntervalInformationDTO } from './DTO/interval-information.dto';
import { CreateDeviceDTO } from './DTO/device.dto';
import { CreateGuardianDTO } from './DTO/guardian.dto';
import { CreateAssistedUserDTO } from './DTO/assisted-user-dto';
import { SignInDTO } from './DTO/signin.dto';
import { CreateAlertDTO } from './DTO/create-alert.dto';
import { PushTokenDTO } from './DTO/push-token.dto';

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
    private readonly alertsStreamService: AlertsStreamService,
    private readonly pushService: PushService,
  ) {}

  @UseGuards(SessionAuthGuard)
  @Get('contacts/:assistedUserID')
  async getContacts(
    @Param('assistedUserID', ParseIntPipe) assistedUserID: number,
    @Req() req: Request,
  ) {
    const currentGuardianID = req.session.guardianID;
    const contacts = await this.webService.getContacts(assistedUserID);
    if (!contacts.some((c) => c.id === currentGuardianID)) {
      throw new ForbiddenException();
    }
    return contacts
      .filter((c) => c.id !== currentGuardianID)
      .map(({ id, ...rest }) => rest);
  }

  @UseGuards(SessionAuthGuard)
  @Sse('alerts-stream/:assistedUserID')
  async streamAlerts(
    @Param('assistedUserID', ParseIntPipe) assistedUserID: number,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    const contacts = await this.webService.getContacts(assistedUserID);
    if (!contacts.some((c) => c.id === req.session.guardianID)) {
      throw new ForbiddenException();
    }
    return this.alertsStreamService.subscribe(assistedUserID);
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
  @Post('link-assisted-user-account')
  async linkAssistedUser(
    @Body() body: { deviceID: string },
    @Req() req: Request,
  ) {
    const assistedUser = await this.webService.linkAssistedUser(
      body.deviceID,
      req.session.guardianID!,
    );
    if (!assistedUser) {
      throw new BadRequestException('unable to link');
    }
    return assistedUser;
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

  @UseGuards(SessionAuthGuard)
  @Post('push/register')
  @HttpCode(204)
  async registerPushToken(
    @Body() pushTokenDTO: PushTokenDTO,
    @Req() req: Request,
  ) {
    await this.pushService.register(req.session.guardianID!, pushTokenDTO);
  }

  // The client sends the token in the body of the DELETE, not in the query.
  @UseGuards(SessionAuthGuard)
  @Delete('push/register')
  @HttpCode(204)
  async unregisterPushToken(
    @Body() pushTokenDTO: PushTokenDTO,
    @Req() req: Request,
  ) {
    await this.pushService.unregister(req.session.guardianID!, pushTokenDTO);
  }

  // Public value: the browser needs it to subscribe, before it has a session.
  @Get('push/vapid-key')
  getVapidKey() {
    return { publicKey: this.pushService.getVapidPublicKey() };
  }
}

// Every route here is authenticated by the device's own credential rather than
// by a guardian session. req.device is set by the guard and is the only
// trustworthy source of the device id — a body or path parameter is a claim
// the caller made about itself, which is exactly what we stopped accepting.
@UseGuards(DeviceAuthGuard)
@Controller('raspberry')
export class RaspberryController {
  constructor(
    private readonly raspberryService: RaspberryService,
    private readonly locationService: LocationService,
  ) {}

  @Post('interval-information')
  async sendIntervalInformation(
    @Body() createIntervalInformationDTO: CreateIntervalInformationDTO,
    @Req() req: Request,
  ) {
    const ok = await this.raspberryService.sendIntervalInformation(
      req.device!.id,
      createIntervalInformationDTO,
    );
    if (!ok) {
      throw new BadRequestException('unknown or unlinked device');
    }
    return 'successful';
  }

  // The device id used to be a path parameter. It is a credential's other half,
  // and URLs end up in access logs, proxy logs and browser history by default,
  // so it moved into the Authorization header along with the secret.
  @Get('guardians')
  async getGuardians(@Req() req: Request) {
    const guardians = await this.raspberryService.getGuardianContacts(
      req.device!.id,
    );
    if (!guardians) {
      throw new BadRequestException('unknown or unlinked device');
    }
    return { guardians };
  }

  @Post('alert')
  async sendAlert(@Body() dto: CreateAlertDTO, @Req() req: Request) {
    const ok = await this.raspberryService.sendAlert(req.device!.id, dto);
    if (!ok) {
      throw new BadRequestException('unknown or unlinked device');
    }
    return 'successful';
  }
}
