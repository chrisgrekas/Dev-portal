import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, exists, ilike, inArray, notExists, or, sql } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { RuleAction, ruleCustomers, ruleEnvironments, rules, ruleVersions } from '../db/schema';
import { ChangeLogService } from '../common/changelog.service';
import { ListQuery, offset } from '../common/pagination';
import { setLinks } from '../common/links';
import { CreateRuleDto, CreateVersionDto, UpdateRuleDto } from './rules.dto';

// Σταθερή σειρά πεδίων για κάθε ενέργεια — ό,τι είναι κενό παραλείπεται.
const ACTION_KEYS = [
  'id', 'typeName', 'layout', 'title', 'method', 'url', 'headers', 'request', 'response',
  'content', 'targetRuleId', 'targetRuleName', 'statusName', 'conditionNote',
] as const;

type VersionContent = { code: string; triggerCondition: string | null; actions: RuleAction[] | null };

/** JSON με ταξινομημένα κλειδιά: το jsonb της Postgres δεν κρατά τη σειρά των κλειδιών. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

const sameContent = (a: VersionContent, b: VersionContent) =>
  a.code === b.code && (a.triggerCondition ?? null) === (b.triggerCondition ?? null) && stable(a.actions ?? null) === stable(b.actions ?? null);

@Injectable()
export class RulesService {
  constructor(@InjectDb() private db: DB, private changes: ChangeLogService) {}

  async list(q: ListQuery) {
    const where = and(
      q.search ? or(ilike(rules.name, `%${q.search}%`), ilike(rules.description, `%${q.search}%`)) : undefined,
      q.customerId
        ? exists(this.db.select().from(ruleCustomers).where(and(eq(ruleCustomers.ruleId, rules.id), eq(ruleCustomers.customerId, q.customerId))))
        : undefined,
      q.environmentId
        ? exists(this.db.select().from(ruleEnvironments).where(and(eq(ruleEnvironments.ruleId, rules.id), eq(ruleEnvironments.environmentId, q.environmentId))))
        : undefined,
      q.withoutCustomer ? notExists(this.db.select().from(ruleCustomers).where(eq(ruleCustomers.ruleId, rules.id))) : undefined,
    );
    const items = await this.db
      .select({
        id: rules.id, name: rules.name, description: rules.description, myclaimId: rules.myclaimId,
        source: rules.source, updatedAt: rules.updatedAt,
        currentVersion: sql<number>`(select max(${ruleVersions.version}) from ${ruleVersions} where ${ruleVersions.ruleId} = ${rules.id})`,
      })
      .from(rules).where(where).orderBy(rules.name).limit(q.pageSize).offset(offset(q));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(rules).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: number) {
    const rule = await this.db.query.rules.findFirst({
      where: eq(rules.id, id),
      with: {
        customers: { with: { customer: true } },
        environments: { with: { environment: true } },
        rulesets: { with: { ruleset: { columns: { id: true, name: true } } } },
      },
    });
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    const [current] = await this.db.select().from(ruleVersions)
      .where(eq(ruleVersions.ruleId, id)).orderBy(desc(ruleVersions.version)).limit(1);
    return {
      ...rule,
      customers: rule.customers.map((c) => c.customer),
      environments: rule.environments.map((e) => e.environment),
      rulesets: rule.rulesets.map((r) => r.ruleset),
      currentVersion: current ?? null,
      ...(await this.chain(id, current?.actions ?? null)),
    };
  }

  /**
   * Αλυσίδα εκτέλεσης από τα «Apply Rule» (layout rule_ref) — πάντα με βάση τη ΝΕΟΤΕΡΗ έκδοση:
   *  - calls:    ποια rules καλεί αυτό (μοναδικά, με τη σειρά των ενεργειών)
   *  - calledBy: ποια rules το καλούν στη δική τους τρέχουσα έκδοση
   * Χωρίς self-reference· τα ονόματα έρχονται από τον πίνακα rules (όχι από το αποθηκευμένο targetRuleName).
   */
  private async chain(id: number, actions: RuleAction[] | null) {
    const targetIds = [...new Set(
      (actions ?? [])
        .filter((a) => a.layout === 'rule_ref' && typeof a.targetRuleId === 'number' && a.targetRuleId !== id)
        .map((a) => a.targetRuleId as number),
    )];
    const names = targetIds.length
      ? new Map((await this.db.select({ id: rules.id, name: rules.name }).from(rules).where(inArray(rules.id, targetIds))).map((r) => [r.id, r.name]))
      : new Map<number, string>();
    const calls = targetIds.filter((t) => names.has(t)).map((t) => ({ id: t, name: names.get(t)! }));

    const res = await this.db.execute<{ id: number; name: string }>(sql`
      select r.id, r.name
      from ${rules} r
      join lateral (
        select v.actions from ${ruleVersions} v where v.rule_id = r.id order by v.version desc limit 1
      ) latest on true
      where r.id <> ${id}
        and exists (
          select 1 from jsonb_array_elements(coalesce(latest.actions, '[]'::jsonb)) a
          where a->>'layout' = 'rule_ref' and a->>'targetRuleId' = ${String(id)}
        )
      order by r.name`);
    const calledBy = res.rows.map((r) => ({ id: Number(r.id), name: r.name }));
    return { calls, calledBy };
  }

  /**
   * Κανονικοποιεί το περιεχόμενο μιας έκδοσης: κενά → null, ενέργειες σε σταθερή μορφή,
   * και το όνομα του rule στα «Apply Rule» από τη βάση (όχι από τον client).
   */
  private async normalize(dto: { code?: string; triggerCondition?: string; actions?: Partial<RuleAction>[] }): Promise<VersionContent> {
    const code = dto.code ?? '';
    const triggerCondition = dto.triggerCondition?.trim() || null;
    if (!dto.actions?.length) return { code, triggerCondition, actions: null };

    const ids = dto.actions.map((a) => a.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate action id');
    const targetIds = [...new Set(dto.actions.map((a) => a.targetRuleId).filter((x): x is number => typeof x === 'number'))];
    const names = new Map<number, string>();
    if (targetIds.length) {
      const found = await this.db.select({ id: rules.id, name: rules.name }).from(rules).where(inArray(rules.id, targetIds));
      found.forEach((r) => names.set(r.id, r.name));
      if (found.length !== targetIds.length) throw new BadRequestException('Unknown targetRuleId');
    }

    const actions = dto.actions.map((a) => {
      const src: Record<string, unknown> = { ...a, typeName: a.typeName?.trim() };
      src.targetRuleName = a.targetRuleId ? names.get(a.targetRuleId) : undefined;
      const out: Record<string, unknown> = {};
      for (const k of ACTION_KEYS) {
        const v = src[k];
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue;
        out[k] = v;
      }
      return out as unknown as RuleAction;
    });
    return { code, triggerCondition, actions };
  }

  async create(dto: CreateRuleDto, author: string) {
    const content = await this.normalize(dto);
    const id = await this.db.transaction(async (tx) => {
      const [rule] = await tx.insert(rules)
        .values({ name: dto.name, description: dto.description, myclaimId: dto.myclaimId, extra: dto.extra })
        .returning();
      await setLinks(tx, ruleCustomers, ruleCustomers.ruleId, rule.id, 'customerId', 'ruleId', dto.customerIds);
      await setLinks(tx, ruleEnvironments, ruleEnvironments.ruleId, rule.id, 'environmentId', 'ruleId', dto.environmentIds);
      const reason = dto.reason || 'Αρχική καταχώρηση';
      await tx.insert(ruleVersions).values({ ruleId: rule.id, version: 1, ...content, reason, author });
      await this.changes.log({ entityType: 'Rule', entityId: rule.id, action: 'create', reason, author }, tx);
      return rule.id;
    });
    return this.get(id);
  }

  async update(id: number, dto: UpdateRuleDto, author: string) {
    await this.db.transaction(async (tx) => {
      const { reason, customerIds, environmentIds, ...fields } = dto;
      const res = await tx.update(rules).set({ ...fields, updatedAt: new Date() }).where(eq(rules.id, id)).returning({ id: rules.id });
      if (!res.length) throw new NotFoundException(`Rule ${id} not found`);
      await setLinks(tx, ruleCustomers, ruleCustomers.ruleId, id, 'customerId', 'ruleId', customerIds);
      await setLinks(tx, ruleEnvironments, ruleEnvironments.ruleId, id, 'environmentId', 'ruleId', environmentIds);
      await this.changes.log({ entityType: 'Rule', entityId: id, action: 'update', reason, author }, tx);
    });
    return this.get(id);
  }

  async versions(id: number) {
    await this.ensureExists(id);
    return this.db.select().from(ruleVersions).where(eq(ruleVersions.ruleId, id)).orderBy(desc(ruleVersions.version));
  }

  async version(id: number, version: number) {
    const [v] = await this.db.select().from(ruleVersions)
      .where(and(eq(ruleVersions.ruleId, id), eq(ruleVersions.version, version)));
    if (!v) throw new NotFoundException(`Rule ${id} version ${version} not found`);
    return v;
  }

  /**
   * Η κύρια λειτουργία: νέα έκδοση κώδικα. Ποτέ δεν αλλάζει παλιές εκδόσεις.
   * Κλειδώνει τη γραμμή του rule ώστε δύο ταυτόχρονες αποθηκεύσεις να μη πάρουν τον ίδιο αριθμό.
   */
  async addVersion(id: number, dto: CreateVersionDto, author: string, source: 'manual' | 'sync' = 'manual') {
    const content = await this.normalize(dto);
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select id from rules where id = ${id} for update`);
      if (!locked.rows.length) throw new NotFoundException(`Rule ${id} not found`);
      const [latest] = await tx.select().from(ruleVersions)
        .where(eq(ruleVersions.ruleId, id)).orderBy(desc(ruleVersions.version)).limit(1);
      // Ίδια έκδοση = ίδιος κώδικας ΚΑΙ ίδιο trigger ΚΑΙ ίδιες ενέργειες.
      if (latest && sameContent(latest, content)) throw new ConflictException('Code is identical to the current version');
      const [v] = await tx.insert(ruleVersions)
        .values({ ruleId: id, version: (latest?.version ?? 0) + 1, ...content, reason: dto.reason, author, source })
        .returning();
      await tx.update(rules).set({ updatedAt: new Date() }).where(eq(rules.id, id));
      await this.changes.log({ entityType: 'Rule', entityId: id, action: `version ${v.version}`, reason: dto.reason, author }, tx);
      return v;
    });
  }

  private async ensureExists(id: number) {
    const [r] = await this.db.select({ id: rules.id }).from(rules).where(eq(rules.id, id));
    if (!r) throw new NotFoundException(`Rule ${id} not found`);
  }
}
