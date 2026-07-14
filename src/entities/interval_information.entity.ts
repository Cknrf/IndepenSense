import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AssistedUser } from './assisted_user.entity';

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
