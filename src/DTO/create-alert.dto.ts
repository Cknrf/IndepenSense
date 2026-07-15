import { EventType } from '../entities/alert_log.entity';

export class CreateAlertDTO {
  deviceID: string;
  eventType: EventType;
  latitude: number;
  longitude: number;
  occuredAt: Date;
}
