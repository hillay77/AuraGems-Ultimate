const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/store.json'), 'utf8'));
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } });
  await client.connect();
  await client.query(fs.readFileSync(path.join(__dirname, '..', 'db/schema.sql'), 'utf8'));
  await client.query('INSERT INTO store_state (id, state) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()', [state]);
  await client.end();
  console.log('Migrated data/store.json to PostgreSQL.');
}
main().catch(error => { console.error(error.message); process.exit(1); });
