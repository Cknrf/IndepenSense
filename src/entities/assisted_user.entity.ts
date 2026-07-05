import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Device } from './device.entity';

@Entity()
export class AssistedUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToOne(() => Device, {
    nullable: false,
  })
  @JoinColumn()
  device: Device;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
