// DAT Hellas Dev Portal — data model (Drizzle ORM)
// Κανόνας: το rule_versions είναι αμετάβλητο. Κάθε αλλαγή κώδικα = νέα έκδοση.
// Επιπλέον το προστατεύει trigger στη βάση (βλ. drizzle/0001_immutability.sql).
import { relations, sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, serial, integer, text, timestamp, jsonb, primaryKey, uniqueIndex, index, check,
} from 'drizzle-orm/pg-core';

export const sourceEnum = pgEnum('source', ['manual', 'sync']);
export const roleEnum = pgEnum('role', ['admin', 'editor', 'viewer']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

// ---------- Βασικές οντότητες ----------
// Ο αριθμός πελάτη είναι ακριβώς 7 ψηφία — το επιβάλλει και η βάση.
export const CUSTOMER_NUMBER_RE = /^\d{7}$/;
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  customerNumber: text('customer_number').notNull().unique(),
  name: text('name').notNull(),
  gitUrl: text('git_url'), // repository του πελάτη (προαιρετικό)
  createdAt: createdAt(),
}, (t) => [check('customer_number_7_digits', sql`${t.customerNumber} ~ '^[0-9]{7}$'`)]);

export const environments = pgTable('environments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

// ---------- Workflows ----------
export const workflows = pgTable('workflows', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  // Πότε ενεργοποιείται (π.χ. «Φάκελος χωρίς deeplink»). Ένας πελάτης μπορεί να έχει πολλά workflows.
  trigger: text('trigger'),
  environmentId: integer('environment_id').references(() => environments.id),
  extra: jsonb('extra'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workflowCustomers = pgTable('workflow_customers', {
  workflowId: integer('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.workflowId, t.customerId] })]);

export const workflowSteps = pgTable('workflow_steps', {
  id: serial('id').primaryKey(),
  workflowId: integer('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  // Σημειώσεις: πώς αλλάζει η κατάσταση, ποιο web service καλείται κ.λπ.
  description: text('description'),
});

export const workflowTransitions = pgTable('workflow_transitions', {
  id: serial('id').primaryKey(),
  fromStepId: integer('from_step_id').notNull().references(() => workflowSteps.id, { onDelete: 'cascade' }),
  toStepId: integer('to_step_id').notNull().references(() => workflowSteps.id, { onDelete: 'cascade' }),
  label: text('label'),
}, (t) => [uniqueIndex('transition_unique').on(t.fromStepId, t.toStepId)]);

// ---------- Rulesets & Rules ----------
export const rulesets = pgTable('rulesets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Σε ποια βήματα workflow τρέχει κάθε ruleset
export const rulesetSteps = pgTable('ruleset_steps', {
  rulesetId: integer('ruleset_id').notNull().references(() => rulesets.id, { onDelete: 'cascade' }),
  stepId: integer('step_id').notNull().references(() => workflowSteps.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.rulesetId, t.stepId] })]);

export const rules = pgTable('rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  myclaimId: text('myclaim_id').unique(), // για μελλοντικό sync με myClaim
  source: sourceEnum('source').notNull().default('manual'),
  extra: jsonb('extra'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ruleCustomers = pgTable('rule_customers', {
  ruleId: integer('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.ruleId, t.customerId] })]);

export const ruleEnvironments = pgTable('rule_environments', {
  ruleId: integer('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  environmentId: integer('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.ruleId, t.environmentId] })]);

export const rulesetRules = pgTable('ruleset_rules', {
  rulesetId: integer('ruleset_id').notNull().references(() => rulesets.id, { onDelete: 'cascade' }),
  ruleId: integer('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.rulesetId, t.ruleId] })]);

// IMMUTABLE — ποτέ update/delete. Το rule δεν σβήνεται αν έχει εκδόσεις (restrict).
// Δομημένη ενέργεια μέσα σε μια έκδοση rule (Action Card).
export const ACTION_LAYOUTS = ['http', 'code', 'rule_ref', 'status', 'text'] as const;
export type ActionLayout = (typeof ACTION_LAYOUTS)[number];
export interface RuleAction {
  id: string; // σταθερό id από τον client — για diff ανά ενέργεια
  typeName: string; // π.χ. «Call Up URL», «Send Email»
  layout: ActionLayout;
  title?: string;
  method?: string; url?: string; headers?: string; request?: string; response?: string; // http
  content?: string; // code | text
  targetRuleId?: number; targetRuleName?: string; // rule_ref
  statusName?: string; conditionNote?: string; // status
}

export const ruleVersions = pgTable('rule_versions', {
  id: serial('id').primaryKey(),
  ruleId: integer('rule_id').notNull().references(() => rules.id, { onDelete: 'restrict' }),
  version: integer('version').notNull(),
  // Ελεύθερος κώδικας (παλιά rules). Νέες εκδόσεις μπορεί να έχουν μόνο actions → ''.
  code: text('code').notNull().default(''),
  triggerCondition: text('trigger_condition'), // π.χ. «Status = Deeplink Completed»
  actions: jsonb('actions').$type<RuleAction[]>(), // με σειρά εκτέλεσης
  reason: text('reason').notNull(),
  author: text('author').notNull(),
  source: sourceEnum('source').notNull().default('manual'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('rule_version_unique').on(t.ruleId, t.version)]);

// Τύποι ενεργειών: εμπλουτίζονται από τους χρήστες (creatable).
export const actionLayoutEnum = pgEnum('action_layout', ACTION_LAYOUTS);
export const actionTypes = pgTable('action_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  layout: actionLayoutEnum('layout').notNull().default('text'),
  createdAt: createdAt(),
});
export const DEFAULT_ACTION_TYPES: { name: string; layout: ActionLayout }[] = [
  { name: 'Call Up URL', layout: 'http' },
  { name: 'Save Template Fields', layout: 'code' },
  { name: 'Apply Rule', layout: 'rule_ref' },
  { name: 'Change Status', layout: 'status' },
];

// ---------- Snippets ----------
export const snippets = pgTable('snippets', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  code: text('code').notNull(),
  language: text('language').notNull().default('javascript'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const snippetCustomers = pgTable('snippet_customers', {
  snippetId: integer('snippet_id').notNull().references(() => snippets.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.snippetId, t.customerId] })]);

export const snippetEnvironments = pgTable('snippet_environments', {
  snippetId: integer('snippet_id').notNull().references(() => snippets.id, { onDelete: 'cascade' }),
  environmentId: integer('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.snippetId, t.environmentId] })]);

// ---------- Wiki ----------
// Άρθρα (markdown): οδηγοί (π.χ. πώς βάζεις deeplink), γενικές πληροφορίες, rules.
export const wikiCategoryEnum = pgEnum('wiki_category', ['guide', 'general', 'rules']);
export const wikiArticles = pgTable('wiki_articles', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  category: wikiCategoryEnum('category').notNull().default('guide'),
  body: text('body').notNull().default(''),
  // Πεδία όπως επικολλώνται κατευθείαν από myClaim / weDAT (ελεύθερο κείμενο).
  myclaimFields: text('myclaim_fields'),
  wedatFields: text('wedat_fields'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Δομημένος κατάλογος πεδίων myClaim / weDAT.
export const fieldSystemEnum = pgEnum('field_system', ['myclaim', 'wedat']);
export const wikiFields = pgTable('wiki_fields', {
  id: serial('id').primaryKey(),
  system: fieldSystemEnum('system').notNull(),
  name: text('name').notNull(), // τεχνικό όνομα, π.χ. vin
  label: text('label'), // όπως φαίνεται στην οθόνη
  type: text('type'),
  description: text('description'),
  example: text('example'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('wiki_field_unique').on(t.system, t.name)]);

// Σχετικά πεδία / rules ανά άρθρο (π.χ. ο οδηγός Deeplink δείχνει τα πεδία και τα rules που αφορά).
export const wikiArticleFields = pgTable('wiki_article_fields', {
  articleId: integer('article_id').notNull().references(() => wikiArticles.id, { onDelete: 'cascade' }),
  fieldId: integer('field_id').notNull().references(() => wikiFields.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.articleId, t.fieldId] })]);

export const wikiArticleRules = pgTable('wiki_article_rules', {
  articleId: integer('article_id').notNull().references(() => wikiArticles.id, { onDelete: 'cascade' }),
  ruleId: integer('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.articleId, t.ruleId] })]);

// ---------- Ιστορικό, χρήστες, API keys ----------
export const changeLog = pgTable('change_log', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  action: text('action').notNull(),
  reason: text('reason'),
  author: text('author').notNull(),
  createdAt: createdAt(),
}, (t) => [index('change_log_entity').on(t.entityType, t.entityId)]);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('viewer'),
  createdAt: createdAt(),
});

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  hashedKey: text('hashed_key').notNull().unique(),
  role: roleEnum('role').notNull().default('viewer'),
  createdAt: createdAt(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

// ---------- Relations (για db.query.* με with:) ----------
export const workflowsRelations = relations(workflows, ({ many, one }) => ({
  steps: many(workflowSteps),
  customers: many(workflowCustomers),
  environment: one(environments, { fields: [workflows.environmentId], references: [environments.id] }),
}));
export const workflowCustomersRelations = relations(workflowCustomers, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowCustomers.workflowId], references: [workflows.id] }),
  customer: one(customers, { fields: [workflowCustomers.customerId], references: [customers.id] }),
}));
export const workflowStepsRelations = relations(workflowSteps, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowSteps.workflowId], references: [workflows.id] }),
  rulesets: many(rulesetSteps),
}));
export const rulesetStepsRelations = relations(rulesetSteps, ({ one }) => ({
  ruleset: one(rulesets, { fields: [rulesetSteps.rulesetId], references: [rulesets.id] }),
  step: one(workflowSteps, { fields: [rulesetSteps.stepId], references: [workflowSteps.id] }),
}));
export const rulesetsRelations = relations(rulesets, ({ many }) => ({
  steps: many(rulesetSteps),
  rules: many(rulesetRules),
}));
export const rulesetRulesRelations = relations(rulesetRules, ({ one }) => ({
  ruleset: one(rulesets, { fields: [rulesetRules.rulesetId], references: [rulesets.id] }),
  rule: one(rules, { fields: [rulesetRules.ruleId], references: [rules.id] }),
}));
export const rulesRelations = relations(rules, ({ many }) => ({
  versions: many(ruleVersions),
  customers: many(ruleCustomers),
  environments: many(ruleEnvironments),
  rulesets: many(rulesetRules),
}));
export const ruleVersionsRelations = relations(ruleVersions, ({ one }) => ({
  rule: one(rules, { fields: [ruleVersions.ruleId], references: [rules.id] }),
}));
export const ruleCustomersRelations = relations(ruleCustomers, ({ one }) => ({
  rule: one(rules, { fields: [ruleCustomers.ruleId], references: [rules.id] }),
  customer: one(customers, { fields: [ruleCustomers.customerId], references: [customers.id] }),
}));
export const ruleEnvironmentsRelations = relations(ruleEnvironments, ({ one }) => ({
  rule: one(rules, { fields: [ruleEnvironments.ruleId], references: [rules.id] }),
  environment: one(environments, { fields: [ruleEnvironments.environmentId], references: [environments.id] }),
}));
export const snippetsRelations = relations(snippets, ({ many }) => ({
  customers: many(snippetCustomers),
  environments: many(snippetEnvironments),
}));
export const snippetCustomersRelations = relations(snippetCustomers, ({ one }) => ({
  snippet: one(snippets, { fields: [snippetCustomers.snippetId], references: [snippets.id] }),
  customer: one(customers, { fields: [snippetCustomers.customerId], references: [customers.id] }),
}));
export const snippetEnvironmentsRelations = relations(snippetEnvironments, ({ one }) => ({
  snippet: one(snippets, { fields: [snippetEnvironments.snippetId], references: [snippets.id] }),
  environment: one(environments, { fields: [snippetEnvironments.environmentId], references: [environments.id] }),
}));
