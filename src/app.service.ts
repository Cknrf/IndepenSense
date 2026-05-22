import { Injectable } from '@nestjs/common';

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
  getBatteryStatus(): string {
    return 'Battery status';
  }
}

@Injectable()
export class RaspberryService {
  sendBatteryStatus(): string {
    return 'Battery status';
  }
}
