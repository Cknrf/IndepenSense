// No deviceID: the device is identified by the credential it authenticated
// with, not by a field it can put anything into. See DeviceAuthGuard.
export class CreateIntervalInformationDTO {
  batteryHealth: number;
  internetStatus: boolean;
  latitude: number;
  longitude: number;
  createdAt: Date;
}
