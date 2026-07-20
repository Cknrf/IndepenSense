import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { Guardian } from './entities/guardian.entity';
import { AssistedUser } from './entities/assisted_user.entity';
import { Device } from './entities/device.entity';

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
