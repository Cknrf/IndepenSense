import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module';
import { Device } from './entities/device.entity';
import {
  generateDeviceSecret,
  generatePairingCode,
  hashPairingCode,
  sha256Hex,
} from './utils/device-credentials';

/**
 * Mints the credentials for one physical unit.
 *
 * This is the moment the binding is created: after this insert commits, the
 * backend has recorded "the device `id` is whoever can produce a string
 * hashing to `secretHash`". Nothing else needs to be arranged — the row is the
 * whole relationship.
 *
 *   npm run provision -- --count 5 --out ./provisioned
 *
 * The two plaintext values are returned once and are unrecoverable afterwards,
 * because only their hashes are stored. Lose them and the unit has to be
 * re-provisioned.
 */

interface ProvisionedDevice {
  id: string;
  secret: string;
  pairingCode: string;
}

export async function provisionDevice(
  dataSource: DataSource,
): Promise<ProvisionedDevice> {
  const id = randomUUID();
  const secret = generateDeviceSecret();
  const pairingCode = generatePairingCode();

  await dataSource.getRepository(Device).insert({
    id,
    isRegistered: true,
    registeredAt: new Date(),
    secretHash: sha256Hex(secret),
    pairingCodeHash: hashPairingCode(pairingCode),
    revokedAt: null,
    lastSeenAt: null,
  });

  return { id, secret, pairingCode };
}

/** The exact one-line contents of /etc/indepensense/device.key on the unit. */
export function keyFileContents(device: ProvisionedDevice): string {
  return `${device.id}.${device.secret}\n`;
}

interface Options {
  count: number;
  outDir: string | null;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { count: 1, outDir: null };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--count': {
        const count = Number(argv[++i]);
        if (!Number.isInteger(count) || count < 1) {
          throw new Error('--count must be a positive integer');
        }
        options.count = count;
        break;
      }
      case '--out': {
        const dir = argv[++i];
        if (!dir) throw new Error('--out requires a directory');
        options.outDir = resolve(dir);
        break;
      }
      default:
        throw new Error(`unknown argument: ${argv[i]}`);
    }
  }

  return options;
}

function report(device: ProvisionedDevice, outDir: string | null): void {
  console.log('');
  console.log(`device id     ${device.id}`);
  console.log(`  → SD card   ${keyFileContents(device).trim()}`);
  console.log(`  → manual    ${device.pairingCode}`);

  if (!outDir) return;

  // 0600: the secret is readable by root only, on this machine and on the unit.
  const path = join(outDir, `${device.id}.key`);
  writeFileSync(path, keyFileContents(device), { mode: 0o600 });
  console.log(`  → wrote     ${path}`);
}

async function provision(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (options.outDir) {
    mkdirSync(options.outDir, { recursive: true, mode: 0o700 });
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const devices: ProvisionedDevice[] = [];

    for (let i = 0; i < options.count; i++) {
      devices.push(await provisionDevice(dataSource));
    }

    console.log(`provisioned ${devices.length} device(s).`);
    for (const device of devices) {
      report(device, options.outDir);
    }

    console.log('');
    console.log('Per unit:');
    console.log(
      '  1. Write the SD card line to /etc/indepensense/device.key on the Pi,',
    );
    console.log('     owned by root, mode 0600. It is sent as:');
    console.log('       Authorization: Bearer <contents of that file>');
    console.log(
      '  2. Print the manual code on the card that ships in the box. It is for',
    );
    console.log(
      '     the guardian to type when linking, and for nothing else.',
    );
    console.log('');
    console.log(
      'Only hashes were stored. These plaintext values cannot be recovered —',
    );
    console.log(
      'if they are lost, revoke the row and provision the unit again.',
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  provision().catch((err) => {
    console.error('provision failed:', err);
    process.exit(1);
  });
}
