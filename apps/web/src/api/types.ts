// Τύποι όπως τους επιστρέφει το NestJS API (apps/api). Ημερομηνίες έρχονται ως ISO strings.

export type Role = 'admin' | 'editor' | 'viewer';
export type Source = 'manual' | 'sync';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Principal {
  kind: 'user' | 'apikey';
  id: number;
  name: string;
  role: Role;
}

export interface Customer {
  id: number;
  customerNumber: string;
  name: string;
  gitUrl: string | null;
  createdAt: string;
}
export type CustomerRef = Pick<Customer, 'id' | 'name' | 'customerNumber'>;

export interface Environment {
  id: number;
  name: string;
}

export interface RuleListItem {
  id: number;
  name: string;
  description: string | null;
  myclaimId: string | null;
  source: Source;
  updatedAt: string;
  currentVersion: number | null;
}

// ---------- Action Cards ----------
export type ActionLayout = 'http' | 'code' | 'rule_ref' | 'status' | 'text';

export interface ActionType {
  id: number;
  name: string;
  layout: ActionLayout;
  createdAt: string;
}

export interface RuleAction {
  id: string;
  typeName: string;
  layout: ActionLayout;
  title?: string;
  method?: string;
  url?: string;
  headers?: string;
  request?: string;
  response?: string;
  content?: string;
  targetRuleId?: number;
  targetRuleName?: string;
  statusName?: string;
  conditionNote?: string;
}

export interface RuleVersion {
  id: number;
  ruleId: number;
  version: number;
  /** Ελεύθερος κώδικας — κενός σε εκδόσεις που έχουν μόνο actions */
  code: string;
  triggerCondition: string | null;
  actions: RuleAction[] | null;
  reason: string;
  author: string;
  source: Source;
  createdAt: string;
}

export interface Rule {
  id: number;
  name: string;
  description: string | null;
  myclaimId: string | null;
  source: Source;
  createdAt: string;
  updatedAt: string;
  customers: Customer[];
  environments: Environment[];
  rulesets: { id: number; name: string }[];
  currentVersion: RuleVersion | null;
  /** Rules που καλεί αυτό (Apply Rule στη νεότερη έκδοσή του) */
  calls: RuleRef[];
  /** Rules που καλούν αυτό στη νεότερη έκδοσή τους */
  calledBy: RuleRef[];
}

export type RuleRef = { id: number; name: string };

export interface Ruleset {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RulesetRuleRef {
  id: number;
  name: string;
  description: string | null;
  order: number;
}

export interface RulesetStepRef {
  id: number;
  name: string;
  workflow: { id: number; name: string };
}

export interface RulesetDetail extends Ruleset {
  rules: RulesetRuleRef[];
  steps: RulesetStepRef[];
}

export interface Workflow {
  id: number;
  name: string;
  description: string | null;
  /** Πότε ενεργοποιείται (υποχρεωτικό για νέα workflows) */
  trigger: string | null;
  environmentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: number;
  workflowId: number;
  name: string;
  order: number;
  description: string | null;
}

export interface WorkflowDetail extends Workflow {
  environment: Environment | null;
  customers: Customer[];
  steps: WorkflowStep[];
}

export interface WorkflowGraph {
  workflow: { id: number; name: string };
  nodes: {
    id: number;
    name: string;
    order: number;
    description: string | null;
    rulesets: { id: number; name: string; rules: { id: number; name: string; description: string | null; order: number }[] }[];
  }[];
  edges: { id: number; source: number; target: number; label: string | null }[];
}

export interface ChangeLogEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  reason: string | null;
  author: string;
  createdAt: string;
}

// ---------- Πελάτης (κεντρική σελίδα) ----------
export interface CustomerOverview extends Customer {
  workflows: Pick<Workflow, 'id' | 'name' | 'description' | 'trigger' | 'environmentId' | 'updatedAt'>[];
  rules: (RuleListItem & { environmentIds: number[] })[];
  rulesets: {
    id: number;
    name: string;
    description: string | null;
    updatedAt: string;
    usedIn: { workflow: { id: number; name: string }; step: { id: number; name: string } }[];
  }[];
}

export interface CustomerHistoryEntry extends ChangeLogEntry {
  entityName: string | null;
}

// ---------- Wiki ----------
export type WikiCategory = 'guide' | 'general' | 'rules';
export type FieldSystem = 'myclaim' | 'wedat';

export interface WikiArticleListItem {
  id: number;
  title: string;
  category: WikiCategory;
  updatedAt: string;
  excerpt: string;
}

export interface WikiArticle {
  id: number;
  title: string;
  category: WikiCategory;
  body: string;
  /** Πεδία όπως επικολλώνται από myClaim / weDAT (ελεύθερο κείμενο) */
  myclaimFields: string | null;
  wedatFields: string | null;
  createdAt: string;
  updatedAt: string;
  /** Παλιότερη σύνδεση με τον κατάλογο πεδίων (δεν επεξεργάζεται πλέον από τη φόρμα) */
  fields: WikiField[];
  rules: { id: number; name: string; description: string | null }[];
}

export interface WikiSummary {
  articles: { id: number; title: string; category: WikiCategory; updatedAt: string }[];
  fieldCounts: Record<FieldSystem, number>;
  recent: { id: number; title: string; category: WikiCategory; updatedAt: string }[];
}

export interface SearchResults {
  customers: Pick<Customer, 'id' | 'customerNumber' | 'name'>[];
  articles: { id: number; title: string; category: WikiCategory }[];
  fields: Pick<WikiField, 'id' | 'system' | 'name' | 'label' | 'type'>[];
}

export interface WikiField {
  id: number;
  system: FieldSystem;
  name: string;
  label: string | null;
  type: string | null;
  description: string | null;
  example: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number;
  email: string;
  role: Role;
  createdAt: string;
}

export interface ApiKey {
  id: number;
  name: string;
  role: Role;
  createdAt: string;
  lastUsedAt: string | null;
}
