import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class IntervalInformation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batteryHealth: string;

  @Column()
  internetStatus: string;

  @Column()
  latitude: string;

  @Column()
  longitude: string;

  @CreateDateColumn({ name: 'createdAt' })
  'createdAt': Date;
}
