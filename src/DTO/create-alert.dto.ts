import { EventType } from '../entities/alert_log.entity';

// No deviceID: the device is identified by the credential it authenticated
// with, not by a field it can put anything into. See DeviceAuthGuard.
export class CreateAlertDTO {
  eventType: EventType;
  latitude: number;
  longitude: number;
  occuredAt: Date;
}
