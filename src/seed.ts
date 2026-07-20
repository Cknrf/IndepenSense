import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { Guardian } from './entities/guardian.entity';
import { AssistedUser } from './entities/assisted_user.entity';
import { Device } from './entities/device.entity';
import { IntervalInformation } from './entities/interval_information.entity';
import { AlertLog, EventType } from './entities/alert_log.entity';

const SEED_DEVICE_ID = '00000000-0000-0000-0000-000000000001';

const GUARDIANS = [
  {
    username: 'guardian1',
    password: 'password123',
    name: 'Alice Guardian',
    role: 'Parent',
    contactNumber: '+358401111111',
    email: 'alice@example.com',
    linkAssistedUser: true,
  },
  {
    username: 'guardian2',
    password: 'password123',
    name: 'Bob Guardian',
    role: 'Sibling',
    contactNumber: '+358402222222',
    email: 'bob@example.com',
    linkAssistedUser: false,
  },
];

const ASSISTED_USER_NAME = 'Charlie Assisted';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const dataSource = app.get(DataSource);

  try {
    const deviceRepo = dataSource.getRepository(Device);
    const assistedRepo = dataSource.getRepository(AssistedUser);
    const guardianRepo = dataSource.getRepository(Guardian);

    let device = await deviceRepo.findOne({ where: { id: SEED_DEVICE_ID } });
    if (!device) {
      device = await deviceRepo.save(
        deviceRepo.create({
          id: SEED_DEVICE_ID,
          isRegistered: true,
          registeredAt: new Date(),
        }),
      );
      console.log(`created device ${device.id}`);
    } else {
      console.log(`device ${device.id} already exists — skipping`);
    }

    let assistedUser = await assistedRepo.findOne({
      where: { device: { id: SEED_DEVICE_ID } },
      relations: { device: true },
    });
    if (!assistedUser) {
      assistedUser = await assistedRepo.save(
        assistedRepo.create({ name: ASSISTED_USER_NAME, device }),
      );
      console.log(`created assisted user ${assistedUser.name}`);
    } else {
      console.log(`assisted user for device already exists — skipping`);
    }

    const intervalRepo = dataSource.getRepository(IntervalInformation);
    const alertRepo = dataSource.getRepository(AlertLog);

    const existingIntervals = await intervalRepo.count({
      where: { assistedUser: { id: assistedUser.id } },
    });
    if (existingIntervals === 0) {
      const now = Date.now();
      const minute = 60 * 1000;
      const intervals = [
        { minutesAgo: 30, batteryHealth: 92, internetStatus: true, latitude: 60.1699, longitude: 24.9384 },
        { minutesAgo: 20, batteryHealth: 78, internetStatus: true, latitude: 60.1705, longitude: 24.9401 },
        { minutesAgo: 10, batteryHealth: 65, internetStatus: false, latitude: 60.1712, longitude: 24.9425 },
        { minutesAgo: 2, batteryHealth: 18, internetStatus: true, latitude: 60.1720, longitude: 24.9450 },
      ];
      for (const i of intervals) {
        const saved = await intervalRepo.save(
          intervalRepo.create({
            assistedUser,
            batteryHealth: i.batteryHealth,
            internetStatus: i.internetStatus,
            latitude: i.latitude,
            longitude: i.longitude,
          }),
        );
        await intervalRepo.update(saved.id, {
          createdAt: new Date(now - i.minutesAgo * minute),
        });
      }
      console.log(`created ${intervals.length} interval information records`);
    } else {
      console.log(`assisted user already has interval information — skipping`);
    }

    const existingAlerts = await alertRepo.count({
      where: { assistedUser: { id: assistedUser.id } },
    });
    if (existingAlerts === 0) {
      const now = Date.now();
      const minute = 60 * 1000;
      const alerts = [
        { minutesAgo: 45, eventType: EventType.FALL, latitude: 60.1699, longitude: 24.9384 },
        { minutesAgo: 25, eventType: EventType.CONNECTIVITY, latitude: 60.1705, longitude: 24.9401 },
        { minutesAgo: 5, eventType: EventType.BATTERY, latitude: 60.1720, longitude: 24.9450 },
      ];
      for (const a of alerts) {
        await alertRepo.save(
          alertRepo.create({
            assistedUser,
            eventType: a.eventType,
            latitude: a.latitude,
            longitude: a.longitude,
            occuredAt: new Date(now - a.minutesAgo * minute),
          }),
        );
      }
      console.log(`created ${alerts.length} alert log records`);
    } else {
      console.log(`assisted user already has alert logs — skipping`);
    }

    for (const g of GUARDIANS) {
      let guardian = await guardianRepo.findOne({
        where: { username: g.username },
        relations: { assistedUsers: true },
      });
      if (!guardian) {
        guardian = await guardianRepo.save(
          guardianRepo.create({
            name: g.name,
            role: g.role,
            contactNumber: g.contactNumber,
            email: g.email,
            username: g.username,
            passwordHash: await bcrypt.hash(g.password, 10),
            assistedUsers: [],
          }),
        );
        console.log(`created guardian ${g.username} (password: ${g.password})`);
      } else {
        console.log(`guardian ${g.username} already exists — skipping`);
      }

      if (
        g.linkAssistedUser &&
        !guardian.assistedUsers.some((u) => u.id === assistedUser!.id)
      ) {
        guardian.assistedUsers = [...guardian.assistedUsers, assistedUser];
        await guardianRepo.save(guardian);
        console.log(`linked ${g.username} → ${assistedUser.name}`);
      }
    }

    console.log('\nseed complete.');
    console.log('login credentials:');
    for (const g of GUARDIANS) {
      console.log(`  ${g.username} / ${g.password}`);
    }
    console.log(`device id: ${SEED_DEVICE_ID}`);
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
