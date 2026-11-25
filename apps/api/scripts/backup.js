// npm run backup → pg_dump σε backups/devportal-YYYY-MM-DD_HH-mm.sql
// Χρειάζεται το pg_dump στο PATH (έρχεται με την εγκατάσταση PostgreSQL).
require('dotenv/config');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
const file = path.join(dir, `devportal-${stamp}.sql`);
execFileSync('pg_dump', ['--dbname', process.env.DATABASE_URL, '--file', file], { stdio: 'inherit' });
console.log('Backup:', file);
