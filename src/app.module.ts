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
import { AlertsStreamService } from './services/alerts-stream.service';
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
      host: process.env.MYSQLHOST ?? 'localhost',
      port: Number(process.env.MYSQLPORT ?? 3306),
      username: process.env.MYSQLUSER ?? 'root',
      password: process.env.MYSQLPASSWORD ?? '',
      database: process.env.MYSQLDATABASE ?? 'indepensense',
      entities: [IntervalInformation, Guardian, AssistedUser, Device, AlertLog],
      synchronize: process.env.NODE_ENV !== 'production',
      retryAttempts: 10,
    }),
  ],
  controllers: [AppController, WebController, RaspberryController],
  providers: [
    AppService,
    WebService,
    RaspberryService,
    LocationService,
    AlertsStreamService,
  ],
})
export class AppModule {
  constructor(private dataSource: DataSource) {}
}
