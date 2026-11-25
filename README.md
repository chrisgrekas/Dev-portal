# DAT Hellas Dev Portal

Εσωτερικό portal για τα workflows, rules, rulesets και snippets του weDAT/myClaim,
με πλήρες ιστορικό εκδόσεων και το «γιατί» κάθε αλλαγής. API-first (REST + Swagger).

**Κατάσταση:** Φάση 1 (βάση), Φάση 2 (API), Φάση 3 (frontend) και Φάση 4 (διάγραμμα workflow) έτοιμες,
με οργάνωση ανά πελάτη και wiki.

### Πλοήγηση
- Πάνω μπάρα με **δύο κύρια σημεία: Πελάτες** (αρχική `/`) **και Wiki**, συν ένα διακριτικό **Όλα** (`/all`) για rules / rulesets / workflows που δεν ανήκουν σε πελάτη.
- **Spotlight** με `⌘K` / `Ctrl+K` (ή `/`) από οποιαδήποτε σελίδα: πελάτες (7ψήφιο ή όνομα), άρθρα wiki, πεδία myClaim/weDAT· `↑` `↓` `Enter` `Esc`.
- Τα **Snippets** και το **γενικό Ιστορικό** δεν εμφανίζονται πλέον στο UI (τα endpoints μένουν στο API). Το ιστορικό ζει **ανά πελάτη**.

### Πελάτες
- **Αρχική:** μεγάλη αναζήτηση για **7ψήφιο αριθμό πελάτη** ή όνομα. 7 ψηφία + `Enter` → σελίδα πελάτη· αν δεν υπάρχει, `+ Δημιουργία πελάτη` (editors/admins). Από κάτω, κάρτες με τους πρόσφατους πελάτες (αποθηκεύονται στον browser).
- Ο **αριθμός πελάτη είναι ακριβώς 7 ψηφία** — το ελέγχουν το UI (ήπιος μετρητής `X / 7`), το API και η βάση (CHECK constraint).
- **Customer Hub** (`/customers/1234567`):
  - Header: αριθμός (κλικ = αντιγραφή), **Git repository** (`customers.git_url`, άνοιγμα σε νέο tab + αντιγραφή) ή `+ Προσθήκη Git URL`.
  - **Φίλτρο περιβάλλοντος** (`Όλα | prod | test`) που εφαρμόζεται σε όλα τα tabs.
  - Tabs **Workflows · Rules · Rulesets · Ιστορικό**. Τα rulesets προκύπτουν από τα βήματα των workflows του πελάτη (πελάτης → workflow → βήμα → ruleset → rule).
  - **Ιστορικό:** μόνο ό,τι αφορά τον πελάτη (τον ίδιο, τα workflows/rules του, τα rulesets των workflows του), ανά μέρα, με 24ωρη ώρα.
  - `+ Νέο workflow / rule` με τον πελάτη ήδη επιλεγμένο. Νέο ruleset: από το βήμα ενός workflow στο διάγραμμα.
- Ένας πελάτης έχει **πολλά workflows**· το καθένα έχει υποχρεωτικό **«Πότε ενεργοποιείται»** (`trigger`). Κάθε βήμα έχει **σημειώσεις**.

### Rules: Action Cards
- Κάθε έκδοση rule έχει προαιρετικό **Trigger / Condition** (π.χ. `Status = Deeplink Completed`) και **ενέργειες** με σειρά εκτέλεσης (`rule_versions.actions`, jsonb). Ο ελεύθερος κώδικας (`code`) μένει — τα παλιά rules εμφανίζονται όπως πριν.
- Layouts: **http** (μέθοδος, URL, Headers / Request / Response), **code**, **text**, **rule_ref** (Apply Rule → άλλο rule), **status** (νέο status + συνθήκη).
- **Τύποι ενεργειών** (`action_types`): 4 προεπιλεγμένοι (Call Up URL, Save Template Fields, Apply Rule, Change Status). Όποιος γράψει νέο όνομα στο «Προσθήκη ενέργειας» (π.χ. «Send Email») τον δημιουργεί για όλη την ομάδα, διαλέγοντας layout.
- Στο Apply Rule και στα Απαιτούμενα Rules του wiki: αν το rule δεν υπάρχει, «+ Δημιουργία rule» το φτιάχνει ως placeholder χωρίς να κλείσει η φόρμα.
- Νέα έκδοση = αλλαγή σε κώδικα **ή** trigger **ή** ενέργειες (αλλιώς 409). Το diff συγκρίνει **ανά ενέργεια**: ποιες προστέθηκαν, αφαιρέθηκαν ή άλλαξαν (π.χ. μόνο το Response της #1).
- Οι εκδόσεις μένουν αμετάβλητες (trigger στη βάση, όπως πάντα).
- **Αλυσίδα εκτέλεσης:** στη σελίδα κάθε rule, μπάρα «← Καλείται από · [rule] · Καλεί →», από τα Apply Rule της **νεότερης** έκδοσης κάθε rule (υπολογίζεται on-the-fly· `GET /rules/:id` → `calls`, `calledBy`).

### Wiki (split view)
- **Μόνιμο sidebar** με live φίλτρο: **Οδηγοί**, **Κατάλογοι Πεδίων** (myClaim / weDAT), **Γενικά & Rules**.
- **Άρθρο** (πλάτος ανάγνωσης ~760px): ο οδηγός σε markdown (κουμπί αντιγραφής σε κάθε code block), τα **πεδία myClaim** και **πεδία weDAT** όπως επικολλήθηκαν (`myclaim_fields`, `wedat_fields` — panel με αντιγραφή) και τα **απαιτούμενα rules** (`wiki_article_rules`). Όταν υπάρχουν τέτοια, εμφανίζεται φίλτρο `Όλα | Οδηγός | Πεδία | Rules`· οι κενές ενότητες δεν φαίνονται.
- **Κατάλογος πεδίων:** όνομα, τύπος, περιγραφή, παράδειγμα, αντιγραφή ονόματος, αναζήτηση.
- Γράφουν editors/admins· κάθε αλλαγή θέλει αιτιολογία.

### Διάγραμμα workflow
Η σελίδα κάθε workflow δείχνει διάγραμμα ροής (layout με [ELK](https://eclipse.dev/elk/), φορτώνεται μόνο σε αυτή τη σελίδα).
Το σχήμα κάθε βήματος προκύπτει αυτόματα από τις μεταβάσεις του — δεν χρειάζεται επιπλέον πεδίο στη βάση:
- χωρίς εισερχόμενες ή χωρίς εξερχόμενες μεταβάσεις → αρχή/τέλος (οβάλ)
- 2+ εξερχόμενες → απόφαση (ρόμβος)· οι ετικέτες των μεταβάσεων (π.χ. «Yes»/«No») εμφανίζονται στα βέλη
- αλλιώς → βήμα (ορθογώνιο, γεμάτο χρώμα αν τρέχουν rulesets εκεί)

Η **σειρά** (`order`) των βημάτων καθορίζει ποιες μεταβάσεις είναι «επιστροφές». Μικρές ροές σχεδιάζονται οριζόντια, μεγάλες κάθετα.
Κλικ σε βήμα → τα rulesets και rules του.

## Stack
- **Web:** React + Vite + TypeScript, TanStack Query, React Router. Minimal design με Apple αισθητική, light/dark αυτόματα
- **API:** NestJS + TypeScript
- **Βάση:** PostgreSQL + Drizzle ORM (καθαρή TypeScript, migrations ως αρχεία SQL στο `apps/api/drizzle/`)
- **Auth:** JWT για χρήστες, `X-API-Key` για συστήματα
- Χωρίς Docker

## Εγκατάσταση

### 1. Προαπαιτούμενα
- **Node.js 20+** (LTS) — https://nodejs.org
- **PostgreSQL 14+**
  - Windows: installer από https://www.postgresql.org/download/windows/ (κράτα τον κωδικό του χρήστη `postgres`· πρόσθεσε το `C:\Program Files\PostgreSQL\<έκδοση>\bin` στο PATH για το `psql`/`pg_dump`)
  - Ubuntu/Debian: `sudo apt install postgresql`

### 2. Βάσεις δεδομένων
Άνοιξε `psql` ως `postgres` (Windows: «SQL Shell (psql)» · Linux: `sudo -u postgres psql`) και τρέξε:
```sql
CREATE USER portal WITH PASSWORD 'portal';
CREATE DATABASE devportal OWNER portal;
CREATE DATABASE devportal_test OWNER portal;
```

### 3. Ρυθμίσεις
```bash
cd apps/api
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```
Άλλαξε το `JWT_SECRET` σε μια μεγάλη τυχαία τιμή.

### 4. Εγκατάσταση, migrations, δεδομένα δοκιμής
Από τον ριζικό φάκελο:
```bash
npm install
npm run db:migrate
npm run db:seed      # ΨΕΥΤΙΚΑ δεδομένα — σβήνει ό,τι υπάρχει στη βάση!
```

### 5. Εκκίνηση
```bash
npm run api
```
- API: http://localhost:3000/api/v1
- **Swagger:** http://localhost:3000/api/docs → πάτα *Authorize*
- Login δοκιμής: `admin@example.com` / `admin123` (από το `POST /auth/login`)

Σε δεύτερο τερματικό:
```bash
npm run web
```
- **Portal:** http://localhost:5173 (το `/api` προωθείται αυτόματα στο API, οπότε δεν χρειάζεται ρύθμιση CORS)
- Για production: `npm run build:web` → στατικά αρχεία στο `apps/web/dist/`. Αν το API είναι σε άλλο domain, όρισε `VITE_API_URL` πριν το build (βλ. `apps/web/.env.example`) και `CORS_ORIGIN` στο API.

## Χρήσιμες εντολές
| Εντολή | Τι κάνει |
|---|---|
| `npm run api` | Ξεκινάει το API με auto-reload |
| `npm run web` | Ξεκινάει το portal (Vite dev server) |
| `npm run build:web` | Typecheck + production build του portal |
| `npm test` | Τρέχει τα tests (στη βάση `devportal_test`) |
| `npm run backup` | `pg_dump` σε `apps/api/backups/` |
| `npm run db:migrate` | Εφαρμόζει νέα migrations |
| `npm run db:generate -w apps/api` | Δημιουργεί migration αφού αλλάξεις το `src/db/schema.ts` |

## Βασικοί κανόνες του σχεδιασμού
- **Οι εκδόσεις κώδικα είναι αμετάβλητες.** Κάθε αλλαγή = `POST /rules/:id/versions` με `code` + `reason`.
  Η βάση έχει trigger που μπλοκάρει UPDATE/DELETE στο `rule_versions` — ακόμα κι αν κάποιος γράψει SQL με το χέρι.
- **Κάθε αλλαγή γράφει αυτόματα στο ιστορικό** (`/changelog`) με author και reason, στην ίδια transaction.
- **Το `reason` είναι υποχρεωτικό** σε κάθε αλλαγή.
- **Κανένα endpoint χωρίς auth**, εκτός από το login.
- Ρόλοι: `viewer` (μόνο ανάγνωση), `editor` (και εγγραφή), `admin` (και χρήστες/API keys).
- `myclaimId` + `source` (manual/sync) υπάρχουν ήδη για τον μελλοντικό συγχρονισμό με το myClaim.

## Βασικά endpoints
- `POST /auth/login` → JWT
- `GET /customers/:customerNumber` → ο πελάτης με workflows, rules, rulesets (μέσω workflows) και snippets
- `GET /customers?search=` → αναζήτηση (ο αριθμός ταιριάζει από την αρχή, το όνομα οπουδήποτε)
- `PATCH /customers/:customerNumber` → όνομα / αριθμός / `gitUrl` (με `reason`)
- `GET /customers/:customerNumber/history?environmentId=&page=` → ιστορικό μόνο για τον πελάτη (με `entityName`)
- `GET /search?q=` → Spotlight: πελάτες, άρθρα, πεδία
- `GET /wiki/summary` → τίτλοι άρθρων + πλήθος πεδίων (sidebar)
- `?withoutCustomer=true` στα `/rules`, `/rulesets`, `/workflows` → μόνο όσα δεν ανήκουν σε πελάτη
- `PATCH /workflows/:id/steps/:stepId` → όνομα, σειρά, σημειώσεις βήματος (με `reason`)
- `GET /wiki/articles?search=&category=guide|general|rules`, `GET|POST|PATCH|DELETE /wiki/articles/:id` (με `myclaimFields`, `wedatFields`, `ruleIds` — κενό κείμενο → αφαιρείται)
- `GET /wiki/fields?search=&system=myclaim|wedat`, `POST|PATCH|DELETE /wiki/fields/:id`
- `GET /rules?search=&customerId=&environmentId=&page=&pageSize=`
- `GET /rules/:id` → με την τρέχουσα έκδοση κώδικα, πελάτες, περιβάλλοντα, rulesets
- `POST /rules/:id/versions` → **νέα έκδοση (η κύρια ενέργεια)**: `code`, `triggerCondition`, `actions[]`, `reason`
- `GET /action-types?search=`, `POST /action-types` (`{ name, layout }`, editors/admins)
- `GET /rules/:id/versions`, `GET /rules/:id/versions/:n`
- `GET /workflows/:id/graph` → βήματα, μεταβάσεις και rulesets/rules ανά βήμα (για τον γράφο)
- `POST /workflows/:id/steps`, `POST /workflows/:id/transitions`
- `/rulesets`, `/snippets`, `/customers`, `/environments`, `/changelog`
- `POST /api-keys` (admin) → το key εμφανίζεται **μία φορά**

## Επόμενα βήματα
1. Επεξεργασία της ροής μέσα από το διάγραμμα (σύρσιμο για νέα μετάβαση, διαγραφή βημάτων/μεταβάσεων — θέλει και endpoints στο API)
2. Αργότερα: script συγχρονισμού με το myClaim, που καλεί αυτό το API με API key
