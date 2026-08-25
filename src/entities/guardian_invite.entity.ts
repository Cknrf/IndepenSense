import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AssistedUser } from './assisted_user.entity';
import { Guardian } from './guardian.entity';

/**
 * A time-boxed, single-use ticket letting one more guardian join an assisted
 * user who has already been claimed.
 *
 * The pairing code printed in the box answers "who owns this device" exactly
 * once. Everyone after that is invited by someone already trusted, so adding a
 * guardian is an authorised act rather than something anyone holding a leaked
 * string can do.
 */
@Entity('guardian_invites')
export class GuardianInvite {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * sha256 of the token, hex. Only the hash is stored: a database dump must not
   * hand over a working invite, and the plaintext is shown to its creator once.
   */
  @Index('IDX_guardian_invites_token', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'assisted_user_id' })
  assistedUserId: number;

  @ManyToOne(() => AssistedUser, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assisted_user_id' })
  assistedUser: AssistedUser;

  @Column({ name: 'created_by_guardian_id' })
  createdByGuardianId: number;

  @ManyToOne(() => Guardian, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_guardian_id' })
  createdBy: Guardian;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  /** Non-null once spent. Set by a conditional UPDATE, never by a read-then-write. */
  @Column({ name: 'redeemed_at', type: 'datetime', nullable: true })
  redeemedAt: Date | null;

  // Explicit type: TypeORM reflects `number | null` as Object and cannot map it.
  @Column({ name: 'redeemed_by_guardian_id', type: 'int', nullable: true })
  redeemedByGuardianId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
