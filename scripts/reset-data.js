import fs from 'node:fs';
import path from 'node:path';

const dataFile = path.resolve(process.env.DATA_FILE || 'data/credit_card_customers.xlsx');
const seedFile = path.resolve(process.env.SEED_FILE || 'data/seed/credit_card_customers_seed.xlsx');

if (!fs.existsSync(seedFile)) {
	console.error(`Seed file not found: ${seedFile}`);
	process.exit(1);
}
fs.mkdirSync(path.dirname(dataFile), { recursive: true });
fs.copyFileSync(seedFile, dataFile);
console.log(`Reset ${path.relative(process.cwd(), dataFile)} from seed (${path.relative(process.cwd(), seedFile)}).`);
