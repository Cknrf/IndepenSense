import { Module } from '@nestjs/common';
import {
  AppController,
  WebController,
  RaspberryController,
} from './app.controller';
import { AppService, WebService, RaspberryService, LocationService } from './app.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IntervalInformation } from './entities/interval_information.entity';

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
      entities: [IntervalInformation],
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
