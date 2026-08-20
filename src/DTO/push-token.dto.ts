import { PushPlatform } from '../entities/device_token.entity';

export class PushTokenDTO {
  platform: PushPlatform;
  token: string;
}
