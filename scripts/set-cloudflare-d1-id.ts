import { readFile, writeFile } from 'node:fs/promises';

const envText = await readFile('.env.local', 'utf8').catch(() => '');
const match = envText.match(/^\s*CLOUDFLARE_D1_DATABASE_ID\s*=\s*["']?([a-f0-9-]{36})["']?\s*$/im);
if (!match) {
  console.error('Add CLOUDFLARE_D1_DATABASE_ID=<D1 database UUID> to .env.local first.');
  process.exit(1);
}

const configPath = 'wrangler.jsonc';
const config = await readFile(configPath, 'utf8');
if (!config.includes('REPLACE_WITH_D1_DATABASE_ID')) {
  console.error('wrangler.jsonc no longer has the expected placeholder; inspect it and update the database_id manually.');
  process.exit(1);
}
await writeFile(configPath, config.replace('REPLACE_WITH_D1_DATABASE_ID', match[1]!), 'utf8');
console.log('Updated wrangler.jsonc with the local D1 database ID.');
