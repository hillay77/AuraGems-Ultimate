const fs = require('fs/promises');
const path = require('path');

class JsonStorage {
  constructor(file) { this.file = file; }
  async load() { return JSON.parse(await fs.readFile(this.file, 'utf8')); }
  async save(value) { await fs.writeFile(this.file, JSON.stringify(value, null, 2)); }
}

class PostgresStorage {
  constructor(connectionString) { this.connectionString = connectionString; }
  async pool() { if (!this.client) { const { Pool } = require('pg'); this.client = new Pool({ connectionString: this.connectionString, max: 10, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } }); } return this.client; }
  async load() { const result = await (await this.pool()).query('SELECT state FROM store_state WHERE id = 1'); if (!result.rows[0]) throw new Error('PostgreSQL store_state is empty; run the migration script'); return result.rows[0].state; }
  async save(value) { await (await this.pool()).query('INSERT INTO store_state (id, state, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()', [value]); }
}

function createStorage(config) { return config.production ? new PostgresStorage(config.databaseUrl) : new JsonStorage(path.join(__dirname, '..', 'data/store.json')); }
module.exports = { JsonStorage, PostgresStorage, createStorage };