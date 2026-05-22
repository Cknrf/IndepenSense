import { Module } from '@nestjs/common';
import {
  AppController,
  WebController,
  RaspberryController,
} from './app.controller';
import { AppService, WebService, RaspberryService } from './app.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '',
      database: 'solo_leveling_website',
      entities: [],
      synchronize: true,
    }),
  ],
  controllers: [AppController, WebController, RaspberryController],
  providers: [AppService, WebService, RaspberryService],
})
export class AppModule {}
