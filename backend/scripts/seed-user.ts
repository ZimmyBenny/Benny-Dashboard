import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';

// Secondary dotenv load: resolve relative to this file so `npm run seed`
// inside backend/ also finds the root .env (same pattern as server.ts).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import bcrypt from 'bcryptjs';
import db from '../src/db/connection';

const USERNAME = process.env.SEED_USERNAME ?? 'benny';
const PASSWORD = process.env.SEED_PASSWORD;

if (!PASSWORD) {
  console.error('[seed] FATAL: SEED_PASSWORD is not set. Example: SEED_PASSWORD=changeme npm run seed');
  process.exit(1);
}

(async () => {
  const existing = db.prepare('SELECT id FROM user WHERE id = 1').get();
  if (existing) {
    console.log('[seed] User id=1 already exists — skipping. To change the password, delete the row first or write an update script.');
    process.exit(0);
  }
  const hash = await bcrypt.hash(PASSWORD, 12);
  db.prepare('INSERT INTO user (id, username, password_hash) VALUES (1, ?, ?)').run(USERNAME, hash);
  console.log(`[seed] User "${USERNAME}" created successfully with bcrypt cost factor 12.`);
  process.exit(0);
})();
