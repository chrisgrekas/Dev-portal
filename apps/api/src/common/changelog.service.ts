import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DB, InjectDb } from '../db/db.module';
import type { DB as Database } from '../db/client';
import { changeLog } from '../db/schema';

// Γράφει αυτόματα μια εγγραφή ιστορικού σε κάθε create/update.
// Δέχεται και transaction (tx) ώστε αλλαγή + ιστορικό να γράφονται μαζί ή καθόλου.
@Injectable()
export class ChangeLogService {
  constructor(@InjectDb() private db: Database) {}

  async log(
    entry: { entityType: string; entityId: number; action: string; reason?: string; author: string },
    tx: Pick<Database, 'insert'> = this.db,
  ) {
    await tx.insert(changeLog).values(entry);
  }

  async list(q: { entityType?: string; entityId?: number; page: number; pageSize: number }) {
    const where = and(
      q.entityType ? eq(changeLog.entityType, q.entityType) : undefined,
      q.entityId ? eq(changeLog.entityId, q.entityId) : undefined,
    );
    const items = await this.db.select().from(changeLog).where(where)
      .orderBy(desc(changeLog.createdAt), desc(changeLog.id))
      .limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(changeLog).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }
}
