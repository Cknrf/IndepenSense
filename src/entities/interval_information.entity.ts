import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class IntervalInformation {
  @PrimaryGeneratedColumn()
  id: number;

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
