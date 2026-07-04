import { Module } from '@nestjs/common';
import {
  AppController,
  WebController,
  RaspberryController,
} from './app.controller';
import {
  AppService,
  WebService,
  RaspberryService,
  LocationService,
} from './app.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IntervalInformation } from './entities/interval_information.entity';
import { Guardian } from './entities/guardian.entity';
import { AssistedUser } from './entities/assisted_user.entity';
import { Device } from './entities/device.entity';
import { AlertLog } from './entities/alert_log.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '',
      database: 'indepensense',
      entities: [IntervalInformation, Guardian, AssistedUser, Device, AlertLog],
      synchronize: true,
      retryAttempts: 3,
    }),
  ],
  controllers: [AppController, WebController, RaspberryController],
  providers: [AppService, WebService, RaspberryService, LocationService],
})
export class AppModule {
  constructor(private dataSource: DataSource) {}
}
