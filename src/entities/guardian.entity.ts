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

  @Column()
  role: string;

  @Column()
  contactNumber: string;

  @Column()
  email: string;

  @Column({ unique: true, nullable: false })
  username: string;

  @Column({ nullable: false })
  passwordHash: string;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
