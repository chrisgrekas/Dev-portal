import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { createDb } from './client';

export const DB = 'DB';
export const PG_POOL = 'PG_POOL';
export const InjectDb = () => Inject(DB);

const { db, pool } = createDb();

@Global()
@Module({
  providers: [
    { provide: DB, useValue: db },
    { provide: PG_POOL, useValue: pool },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
