import { json, error } from '@sveltejs/kit';
import { listCustomers, createCustomer } from '$lib/server/store';
import { validateCustomer } from '$lib/schema';

export const GET = async ({ url }) => {
	const p = url.searchParams;
	return json(
		await listCustomers({
			q: p.get('q') ?? undefined,
			card: p.get('card') ?? undefined,
			occupation: p.get('occupation') ?? undefined,
			gender: p.get('gender') ?? undefined,
			sort: p.get('sort') ?? undefined,
			dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
			page: Number(p.get('page') ?? 1),
			pageSize: Number(p.get('pageSize') ?? 25)
		})
	);
};

export const POST = async ({ request }) => {
	const body = await request.json().catch(() => error(400, 'Body must be JSON'));
	const { data, errors } = validateCustomer(body);
	if (Object.keys(errors).length) return json({ errors }, { status: 422 });
	return json(await createCustomer(data), { status: 201 });
};
