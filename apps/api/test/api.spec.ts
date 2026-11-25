import './setup-db';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'child_process';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DB } from '../src/db/db.module';

describe('Dev Portal API', () => {
  let app: INestApplication;
  let token: string;
  let db: any;

  beforeAll(async () => {
    const env = { ...process.env };
    execSync('npx ts-node scripts/migrate.ts', { env, stdio: 'ignore' });
    execSync('npx ts-node scripts/seed.ts', { env, stdio: 'ignore' });

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DB);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'admin123' }).expect(200);
    token = res.body.accessToken;
  }, 60000);

  afterAll(async () => { await app.close(); });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  describe('auth', () => {
    it('rejects requests without token or API key', async () => {
      await request(app.getHttpServer()).get('/api/v1/rules').expect(401);
    });
    it('rejects an invalid JWT', async () => {
      await request(app.getHttpServer()).get('/api/v1/rules').set('Authorization', 'Bearer nope').expect(401);
    });
    it('rejects an invalid API key', async () => {
      await request(app.getHttpServer()).get('/api/v1/rules').set('X-API-Key', 'dp_wrong').expect(401);
    });
    it('rejects wrong password', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'bad' }).expect(401);
    });
    it('accepts a valid API key, and a viewer key cannot write', async () => {
      const created = await request(app.getHttpServer()).post('/api/v1/api-keys').set(auth()).send({ name: 'ci' }).expect(201);
      const key = created.body.key;
      await request(app.getHttpServer()).get('/api/v1/rules').set('X-API-Key', key).expect(200);
      await request(app.getHttpServer()).post('/api/v1/rules/1/versions').set('X-API-Key', key)
        .send({ code: 'x', reason: 'y' }).expect(403);
    });
  });

  describe('rule versions', () => {
    it('creates a new version instead of changing the old one', async () => {
      const before = await request(app.getHttpServer()).get('/api/v1/rules/1/versions/1').set(auth()).expect(200);
      const v = await request(app.getHttpServer()).post('/api/v1/rules/1/versions').set(auth())
        .send({ code: 'function v2(){}', reason: 'test v2' }).expect(201);
      expect(v.body.version).toBe(2);
      const after = await request(app.getHttpServer()).get('/api/v1/rules/1/versions/1').set(auth()).expect(200);
      expect(after.body.code).toBe(before.body.code);
    });

    it('rejects a version identical to the current one', async () => {
      await request(app.getHttpServer()).post('/api/v1/rules/1/versions').set(auth())
        .send({ code: 'function v2(){}', reason: 'dup' }).expect(409);
    });

    it('requires a reason', async () => {
      await request(app.getHttpServer()).post('/api/v1/rules/1/versions').set(auth()).send({ code: 'function v3(){}' }).expect(400);
    });

    it('the database itself blocks UPDATE and DELETE on rule_versions', async () => {
      // Το Drizzle τυλίγει το σφάλμα· το μήνυμα του PostgreSQL είναι στο error.cause
      const pgMessage = (q: Promise<unknown>) => q.then(() => 'no error', (e: any) => e.cause?.message ?? e.message);
      expect(await pgMessage(db.execute(sql`update rule_versions set code = 'hacked' where rule_id = 1`))).toMatch(/immutable/);
      expect(await pgMessage(db.execute(sql`delete from rule_versions where rule_id = 1`))).toMatch(/immutable/);
    });

    it('assigns unique version numbers under concurrent saves', async () => {
      const results = await Promise.all([1, 2, 3].map((i) =>
        request(app.getHttpServer()).post('/api/v1/rules/2/versions').set(auth()).send({ code: `c${i}`, reason: `r${i}` })));
      const versions = results.map((r) => r.body.version).sort();
      expect(versions).toEqual([2, 3, 4]);
    });
  });

  describe('changelog', () => {
    it('writes an entry with author and reason for every new version', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/changelog?entityType=Rule&entityId=1').set(auth()).expect(200);
      const entry = res.body.items.find((e: any) => e.action === 'version 2');
      expect(entry).toMatchObject({ reason: 'test v2', author: 'admin@example.com' });
    });

    it('writes an entry when a rule is created', async () => {
      const r = await request(app.getHttpServer()).post('/api/v1/rules').set(auth())
        .send({ name: 'newRule', code: 'function n(){}', customerIds: [1], environmentIds: [1] }).expect(201);
      expect(r.body.currentVersion.version).toBe(1);
      const res = await request(app.getHttpServer()).get(`/api/v1/changelog?entityType=Rule&entityId=${r.body.id}`).set(auth());
      expect(res.body.items[0].action).toBe('create');
    });
  });

  describe('workflow graph', () => {
    it('returns steps, edges and the rules running at each step', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/workflows/1/graph').set(auth()).expect(200);
      expect(res.body.nodes).toHaveLength(5);
      expect(res.body.edges.length).toBeGreaterThanOrEqual(4);
      const first = res.body.nodes[0];
      expect(first.rulesets[0].rules.map((r: any) => r.name)).toEqual(['validateVin', 'setDefaultExpert']);
    });
  });

  describe('workflows per customer', () => {
    const server = () => app.getHttpServer();

    it('requires "when it activates" (trigger) for a new workflow', async () => {
      await request(server()).post('/api/v1/workflows').set(auth()).send({ name: 'No trigger', customerIds: [1] }).expect(400);
      await request(server()).post('/api/v1/workflows').set(auth()).send({ name: 'Empty', trigger: '', customerIds: [1] }).expect(400);
    });

    it('a customer can have many workflows, each with its own trigger', async () => {
      await request(server()).post('/api/v1/workflows').set(auth())
        .send({ name: 'Χωρίς deeplink', trigger: 'Φάκελος χωρίς deeplink', customerIds: [1] }).expect(201);
      const res = await request(server()).get('/api/v1/customers/9000001').set(auth()).expect(200);
      expect(res.body.workflows.length).toBeGreaterThanOrEqual(2);
      expect(res.body.workflows.find((w: any) => w.name === 'Χωρίς deeplink').trigger).toBe('Φάκελος χωρίς deeplink');
    });

    it('updates step notes (with reason) and exposes them in the graph', async () => {
      const graph = await request(server()).get('/api/v1/workflows/1/graph').set(auth()).expect(200);
      const step = graph.body.nodes[1];
      await request(server()).patch(`/api/v1/workflows/1/steps/${step.id}`).set(auth()).send({ description: 'x' }).expect(400);
      await request(server()).patch(`/api/v1/workflows/1/steps/${step.id}`).set(auth())
        .send({ description: 'Αλλαγή μέσω web service από το 400', reason: 'τεκμηρίωση' }).expect(200);
      await request(server()).patch(`/api/v1/workflows/2/steps/${step.id}`).set(auth()).send({ name: 'x', reason: 'r' }).expect(404);
      const after = await request(server()).get('/api/v1/workflows/1/graph').set(auth()).expect(200);
      expect(after.body.nodes[1].description).toBe('Αλλαγή μέσω web service από το 400');
    });
  });

  describe('customers', () => {
    const server = () => app.getHttpServer();

    it('renames a customer (reason required, number stays 7 digits)', async () => {
      await request(server()).post('/api/v1/customers').set(auth()).send({ customerNumber: '5555555', name: 'Old' }).expect(201);
      await request(server()).patch('/api/v1/customers/5555555').set(auth()).send({ name: 'New' }).expect(400);
      await request(server()).patch('/api/v1/customers/5555555').set(auth()).send({ customerNumber: '555', reason: 'r' }).expect(400);
      await request(server()).patch('/api/v1/customers/5555555').set(auth()).send({ customerNumber: '9000002', reason: 'r' }).expect(409);
      const r = await request(server()).patch('/api/v1/customers/5555555').set(auth()).send({ name: 'New', reason: 'r' }).expect(200);
      expect(r.body.name).toBe('New');
    });

    it('accepts only 7-digit customer numbers (API and database)', async () => {
      for (const bad of ['123456', '12345678', '12345a7', ' 1234567']) {
        await request(server()).post('/api/v1/customers').set(auth()).send({ customerNumber: bad, name: 'X' }).expect(400);
      }
      await request(server()).post('/api/v1/customers').set(auth()).send({ customerNumber: '1234567', name: 'Seven' }).expect(201);
      const pgMessage = await db.execute(sql`insert into customers (customer_number, name) values ('123', 'raw')`)
        .then(() => 'no error', (e: any) => e.cause?.message ?? e.message);
      expect(pgMessage).toMatch(/customer_number_7_digits/);
    });

    it('returns workflows, rules, rulesets (via workflows) and snippets for a customer number', async () => {
      const res = await request(server()).get('/api/v1/customers/9000001').set(auth()).expect(200);
      expect(res.body.name).toBe('Demo Insurance A');
      expect(res.body.workflows.map((w: any) => w.name)).toContain('Demo Claim Flow');
      expect(res.body.rules.map((r: any) => r.name)).toEqual(expect.arrayContaining(['validateVin', 'approvalLimit']));
      expect(res.body.rulesets.map((r: any) => r.name)).toEqual(['RS_Costing', 'RS_Create']);
      const costing = res.body.rulesets.find((r: any) => r.name === 'RS_Costing');
      expect(costing.usedIn.map((u: any) => u.step.name)).toEqual(['Κοστολόγηση', 'Έγκριση']);
      expect(res.body.snippets).toBeUndefined();
      expect(res.body.gitUrl).toBe('https://git.example.com/demo/insurance-a');
      expect(res.body.rules.find((r: any) => r.name === 'validateVin').environmentIds).toEqual([1, 2]);
    });

    it('customer B sees the shared workflow but not A-only rules', async () => {
      const res = await request(server()).get('/api/v1/customers/9000002').set(auth()).expect(200);
      expect(res.body.workflows).toHaveLength(1);
      expect(res.body.rules).toHaveLength(0);
    });

    it('rejects malformed numbers and 404s unknown ones', async () => {
      await request(server()).get('/api/v1/customers/12345').set(auth()).expect(400);
      await request(server()).get('/api/v1/customers/7654321').set(auth()).expect(404);
    });

    it('searches customer numbers by prefix', async () => {
      const res = await request(server()).get('/api/v1/customers?search=90000').set(auth()).expect(200);
      expect(res.body.items.map((c: any) => c.customerNumber)).toEqual(['9000001', '9000002']);
    });
  });

  describe('wiki', () => {
    const server = () => app.getHttpServer();

    it('creates, searches and updates articles (update needs a reason)', async () => {
      const a = await request(server()).post('/api/v1/wiki/articles').set(auth())
        .send({ title: 'Deeplink σε claim', category: 'guide', body: 'Βήμα 1: άνοιξε το myClaim' }).expect(201);
      const found = await request(server()).get('/api/v1/wiki/articles?search=myclaim&category=guide').set(auth()).expect(200);
      expect(found.body.items.map((x: any) => x.id)).toContain(a.body.id);
      await request(server()).patch(`/api/v1/wiki/articles/${a.body.id}`).set(auth()).send({ body: 'νέο' }).expect(400);
      await request(server()).patch(`/api/v1/wiki/articles/${a.body.id}`).set(auth()).send({ body: 'νέο', reason: 'διόρθωση' }).expect(200);
      const log = await request(server()).get(`/api/v1/changelog?entityType=WikiArticle&entityId=${a.body.id}`).set(auth());
      expect(log.body.items.map((e: any) => e.action)).toEqual(['update', 'create']);
    });

    it('keeps field names unique per system and filters by system', async () => {
      await request(server()).post('/api/v1/wiki/fields').set(auth()).send({ system: 'myclaim', name: 'vin' }).expect(409);
      await request(server()).post('/api/v1/wiki/fields').set(auth()).send({ system: 'wedat', name: 'vin', label: 'VIN' }).expect(201);
      const res = await request(server()).get('/api/v1/wiki/fields?system=wedat&search=vin').set(auth()).expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].system).toBe('wedat');
    });

    it('links related fields and rules to an article', async () => {
      const a = await request(server()).post('/api/v1/wiki/articles').set(auth())
        .send({ title: 'Ρύθμιση Deeplink', category: 'guide', body: '1. …', fieldIds: [2, 1], ruleIds: [1] }).expect(201);
      expect(a.body.fields.map((f: any) => f.id)).toEqual([2, 1]);
      expect(a.body.rules.map((r: any) => r.name)).toEqual(['validateVin']);
      const upd = await request(server()).patch(`/api/v1/wiki/articles/${a.body.id}`).set(auth())
        .send({ fieldIds: [], reason: 'χωρίς πεδία' }).expect(200);
      expect(upd.body.fields).toEqual([]);
      expect(upd.body.rules).toHaveLength(1);
      await request(server()).post('/api/v1/wiki/articles').set(auth())
        .send({ title: 'x', category: 'guide', body: '', fieldIds: [99999] }).expect(400);
    });

    it('stores pasted myClaim / weDAT fields and required rules on an article', async () => {
      const myclaim = 'vin\tΑριθμός πλαισίου\ndeeplinkToken\tToken';
      const a = await request(server()).post('/api/v1/wiki/articles').set(auth())
        .send({ title: 'Deeplink', category: 'guide', body: '## Βήματα', myclaimFields: myclaim, wedatFields: 'DossierId', ruleIds: [1, 3] })
        .expect(201);
      const got = await request(server()).get(`/api/v1/wiki/articles/${a.body.id}`).set(auth()).expect(200);
      expect(got.body.myclaimFields).toBe(myclaim); // αυτούσιο, με tabs
      expect(got.body.wedatFields).toBe('DossierId');
      expect(got.body.rules).toEqual([
        { id: 1, name: 'validateVin', description: expect.any(String) },
        { id: 3, name: 'approvalLimit', description: expect.any(String) },
      ]);

      // κενό → null· ό,τι δεν στέλνεται μένει ίδιο
      const upd = await request(server()).patch(`/api/v1/wiki/articles/${a.body.id}`).set(auth())
        .send({ wedatFields: '  ', reason: 'χωρίς weDAT' }).expect(200);
      expect(upd.body.wedatFields).toBeNull();
      expect(upd.body.myclaimFields).toBe(myclaim);
      expect(upd.body.rules).toHaveLength(2);

      // η αναζήτηση βρίσκει και κείμενο μέσα στα επικολλημένα πεδία
      const found = await request(server()).get('/api/v1/search?q=deeplinkToken').set(auth()).expect(200);
      expect(found.body.articles.map((x: any) => x.id)).toContain(a.body.id);
    });

    it('summary lists articles and field counts for the sidebar', async () => {
      const res = await request(server()).get('/api/v1/wiki/summary').set(auth()).expect(200);
      expect(res.body.articles.map((a: any) => a.title)).toContain('Ρύθμιση Deeplink');
      expect(res.body.fieldCounts.myclaim).toBeGreaterThanOrEqual(4);
      expect(res.body.fieldCounts.wedat).toBeGreaterThanOrEqual(1);
    });

    it('rejects unknown categories and systems', async () => {
      await request(server()).post('/api/v1/wiki/articles').set(auth()).send({ title: 'x', category: 'nope', body: '' }).expect(400);
      await request(server()).get('/api/v1/wiki/fields?system=sap').set(auth()).expect(400);
    });
  });

  describe('action types (creatable)', () => {
    const server = () => app.getHttpServer();

    it('ships the four defaults and lets editors add new ones (case-insensitive unique)', async () => {
      const list = await request(server()).get('/api/v1/action-types').set(auth()).expect(200);
      expect(list.body.map((t: any) => [t.name, t.layout])).toEqual([
        ['Call Up URL', 'http'], ['Save Template Fields', 'code'], ['Apply Rule', 'rule_ref'], ['Change Status', 'status'],
      ]);
      const created = await request(server()).post('/api/v1/action-types').set(auth()).send({ name: '  Send   Email ' }).expect(201);
      expect(created.body).toMatchObject({ name: 'Send Email', layout: 'text' });
      await request(server()).post('/api/v1/action-types').set(auth()).send({ name: 'send email', layout: 'code' }).expect(409);
      await request(server()).post('/api/v1/action-types').set(auth()).send({ name: 'X', layout: 'sql' }).expect(400);
      const found = await request(server()).get('/api/v1/action-types?search=mail').set(auth()).expect(200);
      expect(found.body.map((t: any) => t.name)).toEqual(['Send Email']);
    });
  });

  describe('rule versions with actions', () => {
    const server = () => app.getHttpServer();
    const http = {
      id: 'h1', typeName: 'Call Up URL', layout: 'http', title: 'Generate Token', method: 'POST JSON',
      url: 'https://partner.example.com/token', headers: 'Content-Type: application/json', request: '{"a":1}', response: '{"t":"x"}',
    };

    it('the seed rule keeps its trigger and ordered actions', async () => {
      const list = await request(server()).get('/api/v1/rules?search=sendToPartner').set(auth()).expect(200);
      const rule = await request(server()).get(`/api/v1/rules/${list.body.items[0].id}`).set(auth()).expect(200);
      expect(rule.body.currentVersion.triggerCondition).toBe('Status = Deeplink Completed');
      expect(rule.body.currentVersion.actions.map((a: any) => a.layout)).toEqual(['http', 'code', 'rule_ref', 'status']);
      expect(rule.body.currentVersion.code).toBe('');
    });

    it('creates a version with trigger + actions; identical content is a 409, any change is a new version', async () => {
      const r = await request(server()).post('/api/v1/rules').set(auth()).send({ name: 'deeplinkFlow' }).expect(201);
      expect(r.body.currentVersion.code).toBe(''); // placeholder rule: μόνο όνομα

      const v2 = await request(server()).post(`/api/v1/rules/${r.body.id}/versions`).set(auth())
        .send({
          triggerCondition: ' Status = Deeplink Completed ',
          actions: [http, { id: 'r1', typeName: 'Apply Rule', layout: 'rule_ref', targetRuleId: 1, targetRuleName: 'λάθος όνομα' }],
          reason: 'ενέργειες',
        }).expect(201);
      expect(v2.body.version).toBe(2);
      expect(v2.body.triggerCondition).toBe('Status = Deeplink Completed');
      expect(v2.body.actions[1].targetRuleName).toBe('validateVin'); // από τη βάση, όχι από τον client

      // ίδιο περιεχόμενο (άλλη σειρά κλειδιών, κενά πεδία) → 409
      const { response, title, ...rest } = http;
      await request(server()).post(`/api/v1/rules/${r.body.id}/versions`).set(auth())
        .send({
          triggerCondition: 'Status = Deeplink Completed',
          actions: [{ response, title, content: '', ...rest }, { layout: 'rule_ref', id: 'r1', typeName: 'Apply Rule', targetRuleId: 1 }],
          reason: 'ίδιο',
        }).expect(409);

      // αλλαγή μόνο στο Response της ενέργειας #1 → νέα έκδοση
      const v3 = await request(server()).post(`/api/v1/rules/${r.body.id}/versions`).set(auth())
        .send({
          triggerCondition: 'Status = Deeplink Completed',
          actions: [{ ...http, response: '{"t":"y"}' }, { id: 'r1', typeName: 'Apply Rule', layout: 'rule_ref', targetRuleId: 1 }],
          reason: 'νέο response',
        }).expect(201);
      expect(v3.body.version).toBe(3);

      // αλλαγή μόνο στο trigger → νέα έκδοση
      await request(server()).post(`/api/v1/rules/${r.body.id}/versions`).set(auth())
        .send({ triggerCondition: 'Status = Closed', actions: v3.body.actions, reason: 'trigger' }).expect(201);

      // οι παλιές εκδόσεις μένουν ίδιες
      const old = await request(server()).get(`/api/v1/rules/${r.body.id}/versions/2`).set(auth()).expect(200);
      expect(old.body.actions[0].response).toBe('{"t":"x"}');
    });

    it('rule chain: calls / calledBy follow the latest version only', async () => {
      const ruleB = await request(server()).post('/api/v1/rules').set(auth()).send({ name: 'chainB' }).expect(201);
      const ruleA = await request(server()).post('/api/v1/rules').set(auth()).send({ name: 'chainA' }).expect(201);
      const apply = (targetRuleId: number, id = 'ap') => ({ id, typeName: 'Apply Rule', layout: 'rule_ref', targetRuleId });

      // A → B (δύο φορές το B, μία το validateVin, και ένα self-reference που αγνοείται)
      await request(server()).post(`/api/v1/rules/${ruleA.body.id}/versions`).set(auth())
        .send({ actions: [apply(ruleB.body.id, 'x1'), apply(1, 'x2'), apply(ruleB.body.id, 'x3'), apply(ruleA.body.id, 'x4')], reason: 'σύνδεση' })
        .expect(201);
      const a = await request(server()).get(`/api/v1/rules/${ruleA.body.id}`).set(auth()).expect(200);
      expect(a.body.calls).toEqual([{ id: ruleB.body.id, name: 'chainB' }, { id: 1, name: 'validateVin' }]);
      expect(a.body.calledBy).toEqual([]);
      const b = await request(server()).get(`/api/v1/rules/${ruleB.body.id}`).set(auth()).expect(200);
      expect(b.body.calledBy).toEqual([{ id: ruleA.body.id, name: 'chainA' }]);
      expect(b.body.calls).toEqual([]);

      // νέα έκδοση του A χωρίς τη σύνδεση → η αλυσίδα ενημερώνεται (η παλιά έκδοση δεν μετράει)
      await request(server()).post(`/api/v1/rules/${ruleA.body.id}/versions`).set(auth())
        .send({ actions: [apply(1, 'x2')], reason: 'χωρίς B' }).expect(201);
      const b2 = await request(server()).get(`/api/v1/rules/${ruleB.body.id}`).set(auth()).expect(200);
      expect(b2.body.calledBy).toEqual([]);
      const a2 = await request(server()).get(`/api/v1/rules/${ruleA.body.id}`).set(auth()).expect(200);
      expect(a2.body.calls).toEqual([{ id: 1, name: 'validateVin' }]);
      const vin = await request(server()).get('/api/v1/rules/1').set(auth()).expect(200);
      expect(vin.body.calledBy.map((r: any) => r.name)).toEqual(expect.arrayContaining(['chainA', 'sendToPartner']));
    });

    it('validates actions', async () => {
      const post = (actions: unknown[]) =>
        request(server()).post('/api/v1/rules/2/versions').set(auth()).send({ actions, reason: 'x' });
      await post([{ id: 'a', typeName: 'X', layout: 'sql' }]).expect(400); // άγνωστο layout
      await post([{ id: 'a', typeName: 'X', layout: 'text', evil: true }]).expect(400); // άγνωστο πεδίο
      await post([{ id: 'a', typeName: '', layout: 'text' }]).expect(400);
      await post([{ id: 'a', typeName: 'X', layout: 'text' }, { id: 'a', typeName: 'Y', layout: 'text' }]).expect(400); // διπλό id
      await post([{ id: 'a', typeName: 'Apply Rule', layout: 'rule_ref', targetRuleId: 99999 }]).expect(400);
    });
  });

  describe('customer git url', () => {
    const server = () => app.getHttpServer();

    it('accepts only http(s) URLs and can be cleared', async () => {
      await request(server()).post('/api/v1/customers').set(auth()).send({ customerNumber: '3333333', name: 'G', gitUrl: 'not a url' }).expect(400);
      await request(server()).post('/api/v1/customers').set(auth()).send({ customerNumber: '3333333', name: 'G', gitUrl: 'ftp://x.example.com/r' }).expect(400);
      const c = await request(server()).post('/api/v1/customers').set(auth())
        .send({ customerNumber: '3333333', name: 'G', gitUrl: 'https://gitlab.example.com/dat/g' }).expect(201);
      expect(c.body.gitUrl).toBe('https://gitlab.example.com/dat/g');
      await request(server()).patch('/api/v1/customers/3333333').set(auth()).send({ gitUrl: 'javascript:alert(1)', reason: 'r' }).expect(400);
      const cleared = await request(server()).patch('/api/v1/customers/3333333').set(auth()).send({ gitUrl: '', reason: 'r' }).expect(200);
      expect(cleared.body.gitUrl).toBeNull();
    });
  });

  describe('customer history', () => {
    const server = () => app.getHttpServer();

    it('contains only changes of the customer, its workflows, rules and the rulesets of its workflows', async () => {
      // rule μόνο του πελάτη B — δεν πρέπει να φανεί στο ιστορικό του A
      const other = await request(server()).post('/api/v1/rules').set(auth())
        .send({ name: 'onlyB', code: 'function b(){}', customerIds: [2] }).expect(201);
      await request(server()).patch('/api/v1/rulesets/1').set(auth()).send({ description: 'αλλαγή', reason: 'για το ιστορικό' }).expect(200);
      await request(server()).patch('/api/v1/customers/9000001').set(auth()).send({ name: 'Demo Insurance A', reason: 'ιστορικό πελάτη' }).expect(200);

      const res = await request(server()).get('/api/v1/customers/9000001/history?pageSize=100').set(auth()).expect(200);
      const keys = res.body.items.map((e: any) => `${e.entityType}:${e.entityId}`);
      expect(keys).toContain('Ruleset:1');
      expect(keys).toContain('Customer:1');
      expect(keys).toContain('Rule:1');
      expect(keys).not.toContain(`Rule:${other.body.id}`);
      expect(res.body.items.find((e: any) => e.entityType === 'Ruleset').entityName).toBe('RS_Create');
      expect(res.body.items.every((e: any) => ['Customer', 'Workflow', 'Rule', 'Ruleset'].includes(e.entityType))).toBe(true);
    });

    it('filters by environment', async () => {
      // test (id 1): το Demo Claim Flow είναι prod → κανένα workflow· τα seed rules είναι και στα δύο
      const res = await request(server()).get('/api/v1/customers/9000001/history?environmentId=1&pageSize=100').set(auth()).expect(200);
      expect(res.body.items.some((e: any) => e.entityType === 'Workflow')).toBe(false);
      expect(res.body.items.some((e: any) => e.entityType === 'Ruleset')).toBe(false);
      expect(res.body.items.some((e: any) => e.entityType === 'Rule')).toBe(true);
    });
  });

  describe('spotlight search', () => {
    const server = () => app.getHttpServer();

    it('finds customers, wiki articles and fields in one call', async () => {
      const byNumber = await request(server()).get('/api/v1/search?q=90000').set(auth()).expect(200);
      expect(byNumber.body.customers.map((c: any) => c.customerNumber)).toEqual(['9000001', '9000002']);
      const vin = await request(server()).get('/api/v1/search?q=vin').set(auth()).expect(200);
      expect(vin.body.fields[0].name).toBe('vin');
      expect(vin.body.articles.map((a: any) => a.title)).toContain('Πώς γράφεται ένα rule');
      await request(server()).get('/api/v1/search').set(auth()).expect(400);
    });
  });

  describe('lists of items without customer ("Όλα")', () => {
    const server = () => app.getHttpServer();

    it('filters rules, workflows and rulesets that belong to no customer', async () => {
      const orphanRule = await request(server()).post('/api/v1/rules').set(auth()).send({ name: 'orphanRule', code: 'function o(){}' }).expect(201);
      const orphanWf = await request(server()).post('/api/v1/workflows').set(auth()).send({ name: 'orphanWf', trigger: 'ποτέ' }).expect(201);
      const orphanRs = await request(server()).post('/api/v1/rulesets').set(auth()).send({ name: 'orphanRs' }).expect(201);

      const r = await request(server()).get('/api/v1/rules?withoutCustomer=true&pageSize=100').set(auth()).expect(200);
      expect(r.body.items.map((x: any) => x.id)).toContain(orphanRule.body.id);
      expect(r.body.items.map((x: any) => x.name)).not.toContain('validateVin');

      const w = await request(server()).get('/api/v1/workflows?withoutCustomer=true&pageSize=100').set(auth()).expect(200);
      expect(w.body.items.map((x: any) => x.id)).toContain(orphanWf.body.id);
      expect(w.body.items.map((x: any) => x.name)).not.toContain('Demo Claim Flow');

      const rs = await request(server()).get('/api/v1/rulesets?withoutCustomer=true&pageSize=100').set(auth()).expect(200);
      expect(rs.body.items.map((x: any) => x.id)).toContain(orphanRs.body.id);
      expect(rs.body.items.map((x: any) => x.name)).not.toContain('RS_Create');

      const all = await request(server()).get('/api/v1/rules?pageSize=100').set(auth()).expect(200);
      expect(all.body.items.map((x: any) => x.name)).toEqual(expect.arrayContaining(['validateVin', 'orphanRule']));
    });
  });
});
