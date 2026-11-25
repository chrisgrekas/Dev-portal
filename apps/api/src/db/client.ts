import 'dotenv/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

export function createDb(url = process.env.DATABASE_URL): { db: DB; pool: Pool } {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}
