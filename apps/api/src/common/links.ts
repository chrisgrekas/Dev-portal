import { eq } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * Αντικαθιστά τις συνδέσεις many-to-many (π.χ. rule ↔ customers).
 * ids === undefined → δεν αλλάζει τίποτα· [] → σβήνει όλες τις συνδέσεις.
 */
export async function setLinks(
  tx: any,
  table: PgTable,
  ownerCol: PgColumn,
  ownerId: number,
  otherKey: string,
  ownerKey: string,
  ids?: number[],
) {
  if (ids === undefined) return;
  await tx.delete(table).where(eq(ownerCol, ownerId));
  if (ids.length) await tx.insert(table).values([...new Set(ids)].map((id) => ({ [ownerKey]: ownerId, [otherKey]: id })));
}
