import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  MessageEvent,
  NotFoundException,
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
import { CreateInviteDTO, RedeemInviteDTO } from './DTO/invite.dto';
import { manilaDate } from './utils/manila-time';
import { distanceMeters, type Visit } from './utils/geo';

/**
 * How far a visit has to be from an already-resolved one before it is worth
 * asking the geocoder again. Below this the answer is the same street anyway.
 */
const GEOCODE_REUSE_RADIUS_M = 50;

/** What LocationService hands back — it predates this file's typing. */
type PlaceName = Awaited<ReturnType<LocationService['reverseGeoCode']>>;

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
    @Req() req: Request,
  ) {
    // Being signed in is not enough: the id comes from the path, so without
    // this check any guardian could count upwards through it and read every
    // assisted user's alerts — coordinates and addresses included. The sibling
    // routes above have always checked; this one did not.
    const contacts = await this.webService.getContacts(assistedUserID);
    if (!contacts.some((c) => c.id === req.session.guardianID)) {
      throw new ForbiddenException();
    }

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

  // The History tab: the same alert objects as the route above, restricted to a
  // window the server chooses. There are deliberately no query parameters — a
  // client-supplied range would let the browser ask for more than 7 days, and
  // `from`/`to` below are rendered as fact by the UI, so they are computed here
  // rather than echoed back from the request.
  @UseGuards(SessionAuthGuard)
  @Get('alerts/:assistedUserID/history')
  async getAlertHistory(
    @Param('assistedUserID', ParseIntPipe) assistedUserID: number,
    @Req() req: Request,
  ) {
    // Existence is checked before the guardian link, because an unknown
    // assisted user has no guardians and would otherwise answer 403 — and the
    // web client reads 404 on this route as "history not available".
    if (!(await this.webService.assistedUserExists(assistedUserID))) {
      throw new NotFoundException('assisted user not found');
    }

    const contacts = await this.webService.getContacts(assistedUserID);
    if (!contacts.some((c) => c.id === req.session.guardianID)) {
      throw new ForbiddenException();
    }

    const { alerts, ...window } =
      await this.webService.getAlertHistory(assistedUserID);

    // A week of alerts can repeat the same coordinates many times over (the
    // wearable sits at home), and each distinct pair costs one Nominatim call,
    // so identical points are resolved once per request.
    const locations = new Map<
      string,
      ReturnType<LocationService['reverseGeoCode']>
    >();
    const locationFor = (latitude: number, longitude: number) => {
      const key = `${latitude},${longitude}`;
      let pending = locations.get(key);
      if (!pending) {
        pending = this.locationService.reverseGeoCode(latitude, longitude);
        locations.set(key, pending);
      }
      return pending;
    };

    return {
      ...window,
      alerts: await Promise.all(
        alerts.map(async (a) => ({
          ...a,
          location: await locationFor(a.latitude, a.longitude),
          // Sent so the client groups by the server's idea of the day. If it
          // derived the day from `occuredAt` itself it could disagree with the
          // window at a midnight boundary.
          occuredAtLocalDate: manilaDate(a.occuredAt),
        })),
      ),
    };
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

  // The location History tab. Server-side window, server-side clustering: a raw
  // week is ~20,000 readings, the visits behind them are a few dozen.
  @UseGuards(SessionAuthGuard)
  @Get('interval-information/:assistedUserID/history')
  async getLocationHistory(
    @Param('assistedUserID', ParseIntPipe) assistedUserID: number,
    @Req() req: Request,
  ) {
    const contacts = await this.webService.getContacts(assistedUserID);
    if (!contacts.some((c) => c.id === req.session.guardianID)) {
      throw new ForbiddenException();
    }

    const { visits, ...window } =
      await this.webService.getLocationHistory(assistedUserID);

    // One Nominatim call per *place*, not per visit: a week of going to the same
    // market and back revisits the same coordinates, and the geocoder is shared
    // with the alert path — getting blocked here would take that down too.
    const resolved: {
      latitude: number;
      longitude: number;
      name: PlaceName;
    }[] = [];
    const nameFor = async (latitude: number, longitude: number) => {
      const nearby = resolved.find(
        (r) =>
          distanceMeters(r.latitude, r.longitude, latitude, longitude) <=
          GEOCODE_REUSE_RADIUS_M,
      );
      if (nearby) return nearby.name;

      const name = await this.locationService.reverseGeoCode(
        latitude,
        longitude,
      );
      resolved.push({ latitude, longitude, name });
      return name;
    };

    // Sequential, not Promise.all: this shares a rate-limited third party with
    // the alert routes, so the visits are resolved one at a time.
    const samples: Array<Visit & { location: PlaceName }> = [];
    for (const visit of visits) {
      samples.push({
        ...visit,
        location: await nameFor(visit.latitude, visit.longitude),
      });
    }

    return { ...window, samples };
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

  // Claims a device with the pairing code from its box. This is the only way
  // to become the FIRST guardian, and it works once per device. The old
  // link-assisted-user-account route is gone: it accepted a bare device id,
  // which anyone who saw the manual — or the group chat it was forwarded to —
  // could replay to attach themselves silently. Extra guardians now arrive
  // through /web/invites.
  @UseGuards(SessionAuthGuard)
  @Post('create-assisted-user-account')
  async createAssistedUser(
    @Body() createAssistedUserDTO: CreateAssistedUserDTO,
    @Req() req: Request,
  ) {
    return this.webService.createAssistedUser(
      createAssistedUserDTO,
      req.session.guardianID!,
    );
  }

  // Returns the only copy of the token. It is stored hashed, so it cannot be
  // shown again — losing it means minting another.
  @UseGuards(SessionAuthGuard)
  @Post('invites')
  async createInvite(
    @Body() createInviteDTO: CreateInviteDTO,
    @Req() req: Request,
  ) {
    const assistedUserID = Number(createInviteDTO?.assistedUserID);
    if (!Number.isInteger(assistedUserID)) {
      throw new BadRequestException('assistedUserID must be an integer');
    }
    return this.webService.createInvite(
      assistedUserID,
      req.session.guardianID!,
    );
  }

  @UseGuards(SessionAuthGuard)
  @Post('invites/redeem')
  async redeemInvite(
    @Body() redeemInviteDTO: RedeemInviteDTO,
    @Req() req: Request,
  ) {
    const { assistedUser, guardianName, notify } =
      await this.webService.redeemInvite(
        redeemInviteDTO?.token,
        req.session.guardianID!,
      );

    // The link is already committed; telling people about it is best effort and
    // must not turn a successful redemption into an error.
    await Promise.all(
      notify.map((guardianID) =>
        this.pushService.sendGuardianAddedPush(guardianID, {
          assistedUserId: assistedUser.id,
          assistedUserName: assistedUser.name,
          guardianName,
        }),
      ),
    );

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
