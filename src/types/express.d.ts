import 'express';
import type { Device } from '../entities/device.entity';

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by DeviceAuthGuard once the request has proven it holds the
       * device's secret. Handlers under /raspberry must take the device id
       * from here and never from the request body — a body field is a claim,
       * this is a verified fact.
       */
      device?: Device;
    }
  }
}
