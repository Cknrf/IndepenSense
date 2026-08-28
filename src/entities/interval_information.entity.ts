import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AssistedUser } from './assisted_user.entity';

// The location history query filters on exactly this pair, over a table that
// grows by ~2,880 rows per device per day and is never pruned. Without the
// index that is a full scan of the whole table on every request.
@Index(['assistedUser', 'createdAt'])
@Entity()
export class IntervalInformation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AssistedUser, { nullable: false })
  @JoinColumn()
  assistedUser: AssistedUser;

  @Column()
  batteryHealth: number;

  @Column()
  internetStatus: boolean;

  @Column({ type: 'double' })
  latitude: number;

  @Column({ type: 'double' })
  longitude: number;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
