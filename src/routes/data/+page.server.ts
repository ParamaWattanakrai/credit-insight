import { fail } from '@sveltejs/kit';
import { listCustomers, deleteCustomer } from '$lib/server/store';

export const load = async ({ url }) => {
	const p = url.searchParams;
	const query = {
		q: p.get('q') ?? '',
		card: p.get('card') ?? '',
		occupation: p.get('occupation') ?? '',
		gender: p.get('gender') ?? '',
		sort: p.get('sort') ?? '',
		dir: (p.get('dir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
		page: Number(p.get('page') ?? 1) || 1,
		pageSize: Number(p.get('size') ?? 25) || 25
	};
	const result = await listCustomers(query);
	return {
		query,
		...result,
		rows: result.rows.map((r) => ({ ...r })),
		flash: { created: p.get('created'), updated: p.get('updated'), deleted: p.get('deleted') }
	};
};

export const actions = {
	delete: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!(await deleteCustomer(id))) return fail(404, { message: `Customer ${id} not found` });
		return { deleted: id };
	}
};
