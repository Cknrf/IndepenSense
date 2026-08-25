import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  isRegistered: boolean;

  @Column({ name: 'registeredAt' })
  'registeredAt': Date;

  /**
   * sha256 of the device secret, hex.
   *
   * The plaintext lives in exactly one place: the unit's SD card. It is never
   * printed, never returned by an endpoint, and never logged. This is what the
   * device proves it holds on every request — the id alone proves nothing,
   * since the id is handed to guardians and appears in ordinary logs.
   *
   * Nullable only so rows created before device auth existed still load. A null
   * here means "this device cannot authenticate", never "no auth required".
   */
  @Column({ type: 'char', length: 64, nullable: true, select: false })
  secretHash: string | null;

  /**
   * sha256 of the pairing code printed in the unit's manual, hex, normalised
   * (upper-case, hyphens stripped) before hashing.
   *
   * Read once, when the first guardian claims this device, and never by the
   * device itself. Kept separate from secretHash because this value is meant to
   * be read by humans and will inevitably be forwarded between them — which is
   * survivable only because claiming spends it. See pairedAt.
   */
  @Index('IDX_device_pairing_code', { unique: true })
  @Column({ type: 'char', length: 64, nullable: true, select: false })
  pairingCodeHash: string | null;

  /**
   * When the pairing code was spent. Non-null means this device already has an
   * owner, so the printed code is inert no matter who reads the manual later —
   * further guardians arrive by invite instead.
   *
   * Set by a conditional UPDATE rather than a read-then-write, so two people
   * racing with the same code cannot both win.
   */
  @Column({ type: 'datetime', nullable: true })
  pairedAt: Date | null;

  /**
   * Kill switch for a lost or stolen unit. Any non-null value denies every
   * request from it, including one made by a clone of its SD card.
   */
  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  /** Last successfully authenticated request. Refreshed at most every 5 min. */
  @Column({ type: 'datetime', nullable: true })
  lastSeenAt: Date | null;
}
