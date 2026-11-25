import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, exists, ilike, inArray, notExists, or, sql } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import {
  rules, rulesetRules, rulesets, rulesetSteps, workflowCustomers, workflows, workflowSteps, workflowTransitions,
} from '../db/schema';
import { ChangeLogService } from '../common/changelog.service';
import { ListQuery, offset } from '../common/pagination';
import { setLinks } from '../common/links';
import { CreateStepDto, CreateTransitionDto, CreateWorkflowDto, UpdateStepDto, UpdateWorkflowDto } from './workflows.dto';

@Injectable()
export class WorkflowsService {
  constructor(@InjectDb() private db: DB, private changes: ChangeLogService) {}

  async list(q: ListQuery) {
    const where = and(
      q.search ? or(ilike(workflows.name, `%${q.search}%`), ilike(workflows.description, `%${q.search}%`)) : undefined,
      q.environmentId ? eq(workflows.environmentId, q.environmentId) : undefined,
      q.withoutCustomer ? notExists(this.db.select().from(workflowCustomers).where(eq(workflowCustomers.workflowId, workflows.id))) : undefined,
      q.customerId
        ? exists(this.db.select().from(workflowCustomers).where(and(eq(workflowCustomers.workflowId, workflows.id), eq(workflowCustomers.customerId, q.customerId))))
        : undefined,
    );
    const items = await this.db.select().from(workflows).where(where).orderBy(workflows.name).limit(q.pageSize).offset(offset(q));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(workflows).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: number) {
    const wf = await this.db.query.workflows.findFirst({
      where: eq(workflows.id, id),
      with: {
        environment: true,
        customers: { with: { customer: true } },
        steps: { orderBy: [asc(workflowSteps.order)] },
      },
    });
    if (!wf) throw new NotFoundException(`Workflow ${id} not found`);
    return { ...wf, customers: wf.customers.map((c) => c.customer) };
  }

  /**
   * Ο γράφος για το frontend (Cytoscape): nodes = βήματα, edges = μεταβάσεις,
   * και για κάθε βήμα τα rulesets που τρέχουν εκεί με τα rules τους (με σειρά).
   */
  async graph(id: number) {
    const wf = await this.get(id);
    const stepIds = wf.steps.map((s) => s.id);
    if (!stepIds.length) return { workflow: { id: wf.id, name: wf.name }, nodes: [], edges: [] };

    const edges = await this.db.select().from(workflowTransitions).where(inArray(workflowTransitions.fromStepId, stepIds));
    const rows = await this.db
      .select({
        stepId: rulesetSteps.stepId,
        rulesetId: rulesets.id, rulesetName: rulesets.name,
        ruleId: rules.id, ruleName: rules.name, ruleDescription: rules.description, ruleOrder: rulesetRules.order,
      })
      .from(rulesetSteps)
      .innerJoin(rulesets, eq(rulesets.id, rulesetSteps.rulesetId))
      .leftJoin(rulesetRules, eq(rulesetRules.rulesetId, rulesets.id))
      .leftJoin(rules, eq(rules.id, rulesetRules.ruleId))
      .where(inArray(rulesetSteps.stepId, stepIds))
      .orderBy(rulesets.name, rulesetRules.order);

    const byStep = new Map<number, Map<number, { id: number; name: string; rules: any[] }>>();
    for (const r of rows) {
      const sets = byStep.get(r.stepId) ?? new Map();
      byStep.set(r.stepId, sets);
      const set = sets.get(r.rulesetId) ?? { id: r.rulesetId, name: r.rulesetName, rules: [] };
      sets.set(r.rulesetId, set);
      if (r.ruleId) set.rules.push({ id: r.ruleId, name: r.ruleName, description: r.ruleDescription, order: r.ruleOrder });
    }

    return {
      workflow: { id: wf.id, name: wf.name },
      nodes: wf.steps.map((s) => ({
        id: s.id, name: s.name, order: s.order, description: s.description, rulesets: [...(byStep.get(s.id)?.values() ?? [])],
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.fromStepId, target: e.toStepId, label: e.label })),
    };
  }

  async create(dto: CreateWorkflowDto, author: string) {
    const id = await this.db.transaction(async (tx) => {
      const [wf] = await tx.insert(workflows)
        .values({ name: dto.name, trigger: dto.trigger.trim(), description: dto.description, environmentId: dto.environmentId, extra: dto.extra })
        .returning();
      await setLinks(tx, workflowCustomers, workflowCustomers.workflowId, wf.id, 'customerId', 'workflowId', dto.customerIds);
      await this.changes.log({ entityType: 'Workflow', entityId: wf.id, action: 'create', reason: dto.reason, author }, tx);
      return wf.id;
    });
    return this.get(id);
  }

  async update(id: number, dto: UpdateWorkflowDto, author: string) {
    await this.db.transaction(async (tx) => {
      const { reason, customerIds, ...fields } = dto;
      const res = await tx.update(workflows).set({ ...fields, updatedAt: new Date() }).where(eq(workflows.id, id)).returning({ id: workflows.id });
      if (!res.length) throw new NotFoundException(`Workflow ${id} not found`);
      await setLinks(tx, workflowCustomers, workflowCustomers.workflowId, id, 'customerId', 'workflowId', customerIds);
      await this.changes.log({ entityType: 'Workflow', entityId: id, action: 'update', reason, author }, tx);
    });
    return this.get(id);
  }

  async addStep(id: number, dto: CreateStepDto, author: string) {
    await this.get(id);
    return this.db.transaction(async (tx) => {
      const [step] = await tx.insert(workflowSteps)
        .values({ workflowId: id, name: dto.name, order: dto.order ?? 0, description: dto.description || null }).returning();
      await this.changes.log({ entityType: 'Workflow', entityId: id, action: `add step "${dto.name}"`, author }, tx);
      return step;
    });
  }

  async updateStep(id: number, stepId: number, dto: UpdateStepDto, author: string) {
    return this.db.transaction(async (tx) => {
      const { reason, description, ...rest } = dto;
      // κενές σημειώσεις → null
      const set = { ...rest, ...(description !== undefined ? { description: description.trim() || null } : {}) };
      const [step] = await tx.update(workflowSteps).set(set)
        .where(and(eq(workflowSteps.id, stepId), eq(workflowSteps.workflowId, id))).returning();
      if (!step) throw new NotFoundException(`Step ${stepId} not found in workflow ${id}`);
      await tx.update(workflows).set({ updatedAt: new Date() }).where(eq(workflows.id, id));
      await this.changes.log({ entityType: 'Workflow', entityId: id, action: `update step "${step.name}"`, reason, author }, tx);
      return step;
    });
  }

  async addTransition(id: number, dto: CreateTransitionDto, author: string) {
    const wf = await this.get(id);
    const ids = new Set(wf.steps.map((s) => s.id));
    if (!ids.has(dto.fromStepId) || !ids.has(dto.toStepId)) throw new BadRequestException('Both steps must belong to this workflow');
    return this.db.transaction(async (tx) => {
      const [t] = await tx.insert(workflowTransitions).values(dto).returning();
      await this.changes.log({ entityType: 'Workflow', entityId: id, action: `add transition ${dto.fromStepId}→${dto.toStepId}`, author }, tx);
      return t;
    });
  }
}
