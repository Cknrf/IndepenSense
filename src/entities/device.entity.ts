import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AssistedUser } from './assisted_user.entity';

@Entity()
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  isRegistered: boolean;

  @OneToOne(() => AssistedUser)
  @JoinColumn()
  assistedUser: AssistedUser;

  @CreateDateColumn({ name: 'registeredAt' })
  'registeredAt': Date;
}
