import { json, error } from '@sveltejs/kit';
import { getCustomer, updateCustomer, deleteCustomer } from '$lib/server/store';
import { validateCustomer } from '$lib/schema';

export const GET = async ({ params }) => {
	const c = await getCustomer(params.id);
	if (!c) error(404, 'Customer not found');
	return json(c);
};

// PUT replaces all fields; PATCH updates only the fields provided.
async function update(id: string, request: Request, partial: boolean) {
	const body = await request.json().catch(() => error(400, 'Body must be JSON'));
	const { data, errors } = validateCustomer(body, { partial });
	if (Object.keys(errors).length) return json({ errors }, { status: 422 });
	const c = await updateCustomer(id, data);
	if (!c) error(404, 'Customer not found');
	return json(c);
}
export const PUT = ({ params, request }) => update(params.id, request, false);
export const PATCH = ({ params, request }) => update(params.id, request, true);

export const DELETE = async ({ params }) => {
	if (!(await deleteCustomer(params.id))) error(404, 'Customer not found');
	return new Response(null, { status: 204 });
};
