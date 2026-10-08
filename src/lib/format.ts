/** Money amount. The Kaggle dataset doesn't state a currency, so amounts are shown as plain numbers. */
export const money = (v: number) => Math.round(v).toLocaleString('en-US');
export const compact = (v: number) =>
	Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k` : String(Math.round(v));
export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const num = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const pval = (p: number) => (p < 1e-4 ? '< 0.0001' : p.toFixed(4));
