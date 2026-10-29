
export type ColumnType = 'id' | 'int' | 'float' | 'enum';

export interface Column {
	key: string;
	label: string;
	type: ColumnType;
	group: 'Profile' | 'Card' | 'Spending' | 'Balance & Payments' | 'Engagement';
	min?: number;
	max?: number;
	step?: number;
	options?: string[];
	unit?: 'amt' | '%' | 'months' | 'pts' | '';
	ratio?: boolean;
}

export const CARD_TYPES = ['Basic', 'Silver', 'Gold', 'Platinum', 'Signature'];
export const OCCUPATIONS = [
	'Private Employee',
	'Government Employee',
	'Self-Employed',
	'Business Owner',
	'Retired',
	'Student'
];
export const GENDERS = ['M', 'F'];

export const COLUMNS: Column[] = [
	{ key: 'Customer_ID', label: 'Customer ID', type: 'id', group: 'Profile' },
	{ key: 'Age', label: 'Age', type: 'int', group: 'Profile', min: 18, max: 100 },
	{ key: 'Gender', label: 'Gender', type: 'enum', group: 'Profile', options: GENDERS },
	{ key: 'Annual_Income', label: 'Annual income', type: 'int', group: 'Profile', min: 0, unit: 'amt' },
	{ key: 'Occupation', label: 'Occupation', type: 'enum', group: 'Profile', options: OCCUPATIONS },

	{ key: 'Card_Type', label: 'Card type', type: 'enum', group: 'Card', options: CARD_TYPES },
	{ key: 'Credit_Limit', label: 'Credit limit', type: 'int', group: 'Card', min: 0, unit: 'amt' },
	{ key: 'Card_Age_Months', label: 'Card age', type: 'int', group: 'Card', min: 0, max: 600, unit: 'months' },
	{ key: 'Credit_Score', label: 'Credit score', type: 'int', group: 'Card', min: 300, max: 900 },

	{ key: 'Monthly_Spending', label: 'Monthly spending', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Monthly_Transactions', label: 'Monthly transactions', type: 'int', group: 'Spending', min: 0 },
	{ key: 'Avg_Transaction_Value', label: 'Avg transaction value', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Online_Shopping_Spending', label: 'Online shopping', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Grocery_Spending', label: 'Grocery', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Fuel_Spending', label: 'Fuel', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Dining_Spending', label: 'Dining', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Travel_Spending', label: 'Travel', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Entertainment_Spending', label: 'Entertainment', type: 'float', group: 'Spending', min: 0, unit: 'amt' },
	{ key: 'Utility_Bill_Spending', label: 'Utility bills', type: 'float', group: 'Spending', min: 0, unit: 'amt' },

	{ key: 'Outstanding_Balance', label: 'Outstanding balance', type: 'float', group: 'Balance & Payments', min: 0, unit: 'amt' },
	{ key: 'Statement_Balance', label: 'Statement balance', type: 'float', group: 'Balance & Payments', min: 0, unit: 'amt' },
	{ key: 'Payment_Amount', label: 'Payment amount', type: 'float', group: 'Balance & Payments', min: 0, unit: 'amt' },
	{ key: 'Payment_Ratio', label: 'Payment ratio', type: 'float', group: 'Balance & Payments', min: 0, max: 1, step: 0.01, ratio: true, unit: '%' },
	{ key: 'Credit_Utilization', label: 'Credit utilization', type: 'float', group: 'Balance & Payments', min: 0, max: 1, step: 0.01, ratio: true, unit: '%' },
	{ key: 'Cash_Advance_Amount', label: 'Cash advance', type: 'float', group: 'Balance & Payments', min: 0, unit: 'amt' },
	{ key: 'EMI_Count', label: 'EMI (installment) count', type: 'int', group: 'Balance & Payments', min: 0, max: 50 },

	{ key: 'International_Transactions', label: 'International transactions', type: 'int', group: 'Engagement', min: 0 },
	{ key: 'Reward_Points_Earned', label: 'Reward points earned', type: 'int', group: 'Engagement', min: 0, unit: 'pts' },
	{ key: 'Reward_Points_Redeemed', label: 'Reward points redeemed', type: 'int', group: 'Engagement', min: 0, unit: 'pts' },
	{ key: 'Mobile_App_Login', label: 'Mobile app logins / month', type: 'int', group: 'Engagement', min: 0 }
];

export const EXCEL_ORDER = [
	'Customer_ID', 'Age', 'Gender', 'Annual_Income', 'Occupation', 'Card_Type', 'Credit_Limit',
	'Card_Age_Months', 'Monthly_Spending', 'Monthly_Transactions', 'Avg_Transaction_Value',
	'Online_Shopping_Spending', 'Grocery_Spending', 'Fuel_Spending', 'Dining_Spending',
	'Travel_Spending', 'Entertainment_Spending', 'Utility_Bill_Spending', 'Outstanding_Balance',
	'Statement_Balance', 'Payment_Amount', 'Payment_Ratio', 'Credit_Utilization',
	'Cash_Advance_Amount', 'EMI_Count', 'International_Transactions', 'Reward_Points_Earned',
	'Reward_Points_Redeemed', 'Mobile_App_Login', 'Credit_Score'
];

export const COLUMN_MAP: Record<string, Column> = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
export const NUMERIC_KEYS = COLUMNS.filter((c) => c.type === 'int' || c.type === 'float').map((c) => c.key);
export const SPENDING_CATEGORIES = [
	'Grocery_Spending',
	'Utility_Bill_Spending',
	'Online_Shopping_Spending',
	'Fuel_Spending',
	'Dining_Spending',
	'Entertainment_Spending',
	'Travel_Spending'
];

export type Customer = Record<string, string | number>;

export interface ValidationResult {
	data: Customer;
	errors: Record<string, string>;
}

export function validateCustomer(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
	const data: Customer = {};
	const errors: Record<string, string> = {};

	for (const col of COLUMNS) {
		if (col.type === 'id') continue;
		const raw = input[col.key];
		const missing = raw === undefined || raw === null || String(raw).trim() === '';
		if (missing) {
			if (!opts.partial) errors[col.key] = 'Required';
			continue;
		}

		if (col.type === 'enum') {
			const v = String(raw).trim();
			if (!col.options!.includes(v)) errors[col.key] = `Must be one of: ${col.options!.join(', ')}`;
			else data[col.key] = v;
			continue;
		}

		const n = Number(String(raw).replace(/,/g, ''));
		if (!Number.isFinite(n)) {
			errors[col.key] = 'Must be a number';
			continue;
		}
		if (col.type === 'int' && !Number.isInteger(n)) {
			errors[col.key] = 'Must be a whole number';
			continue;
		}
		if (col.min !== undefined && n < col.min) {
			errors[col.key] = `Must be ≥ ${col.min}`;
			continue;
		}
		if (col.max !== undefined && n > col.max) {
			errors[col.key] = `Must be ≤ ${col.max}`;
			continue;
		}
		data[col.key] = col.type === 'float' ? Math.round(n * 100) / 100 : n;
	}

	return { data, errors };
}

export function formatValue(key: string, v: unknown): string {
	const col = COLUMN_MAP[key];
	if (v === undefined || v === null || v === '') return '—';
	if (!col || col.type === 'id' || col.type === 'enum') return String(v);
	const n = Number(v);
	if (col.ratio) return `${(n * 100).toFixed(0)}%`;
	if (col.type === 'float') return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
	return n.toLocaleString('en-US');
}
