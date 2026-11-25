// ΨΕΥΤΙΚΑ δεδομένα για ανάπτυξη. Ποτέ πραγματικά δεδομένα πελατών εδώ.
import { sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { createDb } from '../src/db/client';
import * as s from '../src/db/schema';

async function main() {
  const { db, pool } = createDb();

  // Καθαρισμός (μόνο dev). Το TRUNCATE δεν ενεργοποιεί το trigger immutability.
  await db.execute(sql`TRUNCATE rule_versions, ruleset_rules, ruleset_steps, rule_customers,
    rule_environments, snippet_customers, snippet_environments, workflow_customers,
    workflow_transitions, change_log, api_keys, users, snippets, rules, rulesets,
    workflow_steps, workflows, customers, environments, wiki_article_fields, wiki_article_rules, wiki_articles, wiki_fields, action_types RESTART IDENTITY CASCADE`);

  await db.insert(s.actionTypes).values(s.DEFAULT_ACTION_TYPES);

  const [test, prod] = await db.insert(s.environments).values([{ name: 'test' }, { name: 'prod' }]).returning();
  const [custA, custB] = await db.insert(s.customers).values([
    { customerNumber: '9000001', name: 'Demo Insurance A', gitUrl: 'https://git.example.com/demo/insurance-a' },
    { customerNumber: '9000002', name: 'Demo Leasing B' },
  ]).returning();

  const [wf] = await db.insert(s.workflows).values({
    name: 'Demo Claim Flow',
    trigger: 'Κάθε νέος φάκελος ζημιάς (δείγμα)',
    description: 'Δείγμα ροής ζημιάς: δημιουργία → πραγματογνωμοσύνη → κοστολόγηση → έγκριση → κλείσιμο',
    environmentId: prod.id,
  }).returning();
  await db.insert(s.workflowCustomers).values([
    { workflowId: wf.id, customerId: custA.id },
    { workflowId: wf.id, customerId: custB.id },
  ]);

  const stepNames = ['Δημιουργία', 'Πραγματογνωμοσύνη', 'Κοστολόγηση', 'Έγκριση', 'Κλείσιμο'];
  const steps = await db.insert(s.workflowSteps)
    .values(stepNames.map((name, order) => ({ workflowId: wf.id, name, order })))
    .returning();
  await db.insert(s.workflowTransitions).values([
    ...steps.slice(0, -1).map((st, i) => ({ fromStepId: st.id, toStepId: steps[i + 1].id })),
    { fromStepId: steps[3].id, toStepId: steps[2].id, label: 'απόρριψη' },
  ]);

  const ruleDefs = [
    {
      name: 'validateVin',
      description: 'Ελέγχει ότι το VIN έχει 17 χαρακτήρες',
      code: `function validateVin(claim) {\n  var vin = claim.getField('vin');\n  if (!vin || vin.length !== 17) {\n    claim.addError('vin', 'Μη έγκυρο VIN');\n  }\n}`,
    },
    {
      name: 'setDefaultExpert',
      description: 'Ορίζει προεπιλεγμένο πραγματογνώμονα αν δεν υπάρχει',
      code: `function setDefaultExpert(claim) {\n  if (!claim.getField('expert')) {\n    claim.setField('expert', 'DEFAULT');\n  }\n}`,
    },
    {
      name: 'approvalLimit',
      description: 'Στέλνει για έγκριση αν το κόστος ξεπερνά το όριο',
      code: `function approvalLimit(claim) {\n  var total = Number(claim.getField('totalCost') || 0);\n  claim.setField('needsApproval', total > 3000);\n}`,
    },
  ];
  const createdRules = await db.insert(s.rules)
    .values(ruleDefs.map(({ name, description }) => ({ name, description })))
    .returning();
  await db.insert(s.ruleVersions).values(createdRules.map((r, i) => ({
    ruleId: r.id, version: 1, code: ruleDefs[i].code, reason: 'Αρχική καταχώρηση', author: 'seed',
  })));
  await db.insert(s.ruleCustomers).values(createdRules.map((r) => ({ ruleId: r.id, customerId: custA.id })));
  await db.insert(s.ruleEnvironments).values(createdRules.flatMap((r) => [
    { ruleId: r.id, environmentId: test.id }, { ruleId: r.id, environmentId: prod.id },
  ]));

  // Δείγμα rule με δομημένες ενέργειες (Action Cards). Ψεύτικα URLs (example.com).
  const [actionRule] = await db.insert(s.rules)
    .values({ name: 'sendToPartner', description: 'Στέλνει τον φάκελο στον συνεργάτη όταν ολοκληρωθεί το deeplink' })
    .returning();
  await db.insert(s.ruleVersions).values({
    ruleId: actionRule.id, version: 1, code: '', reason: 'Αρχική καταχώρηση', author: 'seed',
    triggerCondition: 'Status = Deeplink Completed',
    actions: [
      {
        id: 'a1', typeName: 'Call Up URL', layout: 'http', title: 'Generate Token', method: 'POST JSON',
        url: 'https://partner.example.com/api/token',
        headers: 'Content-Type: application/json',
        request: '{\n  "client": "demo",\n  "secret": "<secret>"\n}',
        response: '{\n  "token": "eyJ…"\n}',
      },
      { id: 'a2', typeName: 'Save Template Fields', layout: 'code', content: 'claim.setField("partnerToken", response.token);' },
      { id: 'a3', typeName: 'Apply Rule', layout: 'rule_ref', targetRuleId: createdRules[0].id, targetRuleName: createdRules[0].name },
      { id: 'a4', typeName: 'Change Status', layout: 'status', statusName: 'Sent to Partner', conditionNote: 'Αν vehicle_selected = YES' },
    ],
  });
  await db.insert(s.ruleCustomers).values({ ruleId: actionRule.id, customerId: custA.id });
  await db.insert(s.ruleEnvironments).values([
    { ruleId: actionRule.id, environmentId: test.id }, { ruleId: actionRule.id, environmentId: prod.id },
  ]);

  const [rsCreate, rsCosting] = await db.insert(s.rulesets).values([
    { name: 'RS_Create', description: 'Έλεγχοι κατά τη δημιουργία' },
    { name: 'RS_Costing', description: 'Κανόνες κοστολόγησης' },
  ]).returning();
  await db.insert(s.rulesetSteps).values([
    { rulesetId: rsCreate.id, stepId: steps[0].id },
    { rulesetId: rsCosting.id, stepId: steps[2].id },
    { rulesetId: rsCosting.id, stepId: steps[3].id },
  ]);
  await db.insert(s.rulesetRules).values([
    { rulesetId: rsCreate.id, ruleId: createdRules[0].id, order: 0 },
    { rulesetId: rsCreate.id, ruleId: createdRules[1].id, order: 1 },
    { rulesetId: rsCosting.id, ruleId: createdRules[2].id, order: 0 },
  ]);

  const [snip] = await db.insert(s.snippets).values({
    title: 'Ασφαλές διάβασμα αριθμητικού πεδίου',
    description: 'Επιστρέφει 0 αντί για NaN όταν το πεδίο είναι κενό',
    code: `function num(claim, f) {\n  var v = Number(claim.getField(f));\n  return isNaN(v) ? 0 : v;\n}`,
  }).returning();
  await db.insert(s.snippetCustomers).values({ snippetId: snip.id, customerId: custA.id });
  await db.insert(s.snippetEnvironments).values({ snippetId: snip.id, environmentId: prod.id });

  // Wiki: τα πεδία που χρησιμοποιούν τα δείγματα rules παραπάνω.
  const fields = await db.insert(s.wikiFields).values([
    { system: 'myclaim', name: 'vin', label: 'Αριθμός πλαισίου (VIN)', type: 'string', description: 'Ελέγχεται από το validateVin — 17 χαρακτήρες.', example: 'WVWZZZ1JZXW000001' },
    { system: 'myclaim', name: 'expert', label: 'Πραγματογνώμονας', type: 'string', description: 'Αν είναι κενό, το setDefaultExpert βάζει DEFAULT.', example: 'DEFAULT' },
    { system: 'myclaim', name: 'totalCost', label: 'Συνολικό κόστος', type: 'number', description: 'Χρησιμοποιείται από το approvalLimit.', example: '2450.00' },
    { system: 'myclaim', name: 'needsApproval', label: 'Χρειάζεται έγκριση', type: 'boolean', description: 'Ορίζεται από το approvalLimit όταν το κόστος ξεπερνά τα 3000.', example: 'true' },
  ]).returning();
  const [, ruleGuide] = await db.insert(s.wikiArticles).values([
    {
      title: 'Πώς βάζεις deeplink',
      category: 'guide',
      body: '> Δείγμα από το seed — αντικατάστησέ το με τα πραγματικά βήματα.\n\n## Βήματα\n1. …\n2. …\n3. …\n\n## Παράδειγμα\n```\nhttps://…\n```\n',
    },
    {
      title: 'Πώς γράφεται ένα rule',
      category: 'rules',
      body: 'Κάθε rule είναι μια συνάρτηση που δέχεται το `claim`.\n\n- `claim.getField(name)` — διαβάζει πεδίο (δες **Πεδία myClaim**)\n- `claim.setField(name, value)` — γράφει πεδίο\n- `claim.addError(name, message)` — εμφανίζει σφάλμα στο πεδίο\n\n```js\nfunction validateVin(claim) {\n  var vin = claim.getField(\'vin\');\n  if (!vin || vin.length !== 17) claim.addError(\'vin\', \'Μη έγκυρο VIN\');\n}\n```\n\nΚάθε αλλαγή κώδικα γίνεται με **νέα έκδοση** και υποχρεωτική αιτιολογία.',
    },
  ]).returning();
  // Ο οδηγός για τα rules δείχνει τα πεδία και τα rules που αναφέρει.
  await db.insert(s.wikiArticleFields).values(fields.map((fl, order) => ({ articleId: ruleGuide.id, fieldId: fl.id, order })));
  await db.insert(s.wikiArticleRules).values([
    { articleId: ruleGuide.id, ruleId: createdRules[0].id, order: 0 },
    { articleId: ruleGuide.id, ruleId: createdRules[2].id, order: 1 },
  ]);

  await db.insert(s.users).values({
    email: 'admin@example.com', passwordHash: await bcrypt.hash('admin123', 10), role: 'admin',
  });

  console.log('Seed OK — login: admin@example.com / admin123');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
