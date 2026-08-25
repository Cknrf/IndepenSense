// The device is identified by the pairing code printed in its box, not by its
// id: the code proves the guardian physically has the unit, and claiming spends
// it. See Device.pairingCodeHash / Device.pairedAt.
export class CreateAssistedUserDTO {
  name: string;
  pairingCode: string;
}
