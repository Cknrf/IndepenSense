import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { AssistedUser } from './assisted_user.entity';

@Entity()
export class Guardian {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToMany(() => AssistedUser, {
    cascade: true,
  })
  @JoinTable()
  assistedUsers: AssistedUser[];

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn({ name: 'createdAt' })
  'createdAt': Date;
}
