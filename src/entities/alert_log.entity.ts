import {
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { AssistedUser } from './assisted_user.entity';

export enum EventType {
  EMERGENCY = 'Emergency Alert',
  FALL = 'Fall Detection',
  BATTERY = 'Low Battery',
  CONNECTIVITY = 'Connectivity',
}

@Entity()
export class AlertLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: EventType })
  eventType: EventType;

  @Column({ type: 'double' })
  latitude: number;

  @Column({ type: 'double' })
  longitude: number;

  @ManyToOne(() => AssistedUser)
  assistedUser: AssistedUser;

  @Column()
  occuredAt: Date;
}
