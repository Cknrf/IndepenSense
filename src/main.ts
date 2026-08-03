import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    app.set('trust proxy', 1);
  }

  const dataSource = app.get(DataSource);
  const pool = (dataSource.driver as any).pool;

  const MySQLStore = MySQLStoreFactory(session as any);
  const sessionStore = new MySQLStore({}, pool);

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
