// No deviceID: the device is identified by the credential it authenticated
// with, not by a field it can put anything into. See DeviceAuthGuard.
// No createdAt either: the server stamps it. The device does not send one
// today, and this class cannot stop it if it ever did — @Body() hands the
// handler the raw JSON — so the guarantee lives in sendIntervalInformation,
// which assigns the columns one by one. This declaration just says so.
export class CreateIntervalInformationDTO {
  batteryHealth: number;
  internetStatus: boolean;
  latitude: number;
  longitude: number;
}
