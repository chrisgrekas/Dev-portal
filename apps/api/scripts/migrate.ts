// Εφαρμόζει όλα τα migrations από τον φάκελο drizzle/
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/db/client';

(async () => {
  const { db, pool } = createDb();
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations OK');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
