import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Guardian } from './guardian.entity';

export type PushPlatform = 'fcm' | 'webpush';

/**
 * A push destination, bound to a GUARDIAN rather than to an assisted user.
 *
 * When the app is closed there is no "currently selected" assisted user, so a
 * guardian watching several people has to be woken for any of them. The SSE
 * stream stays per-assisted-user; only push is per-guardian.
 */
@Entity('device_tokens')
// MySQL cannot index a TEXT column without a prefix length, so uniqueness is
// enforced on a hash of the token instead. Keeping `token` itself as TEXT means
// no push subscription is ever too long to store.
@Unique('UQ_device_tokens_platform_token', ['platform', 'tokenHash'])
export class DeviceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_device_tokens_guardian')
  @Column({ name: 'guardian_id' })
  guardianId: number;

  @ManyToOne(() => Guardian, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guardian_id' })
  guardian: Guardian;

  @Column({ type: 'enum', enum: ['fcm', 'webpush'] })
  platform: PushPlatform;

  /** FCM registration token, or a JSON-stringified PushSubscription. */
  @Column({ type: 'text' })
  token: string;

  /** sha256(token), hex. Exists only to make the token indexable. */
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'last_seen_at', type: 'datetime' })
  lastSeenAt: Date;
}
