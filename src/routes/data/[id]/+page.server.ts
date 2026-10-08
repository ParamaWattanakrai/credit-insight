import { error, fail, redirect } from '@sveltejs/kit';
import { getCustomer, updateCustomer, deleteCustomer } from '$lib/server/store';
import { validateCustomer } from '$lib/schema';

export const load = async ({ params }) => {
	const customer = await getCustomer(params.id);
	if (!customer) error(404, `Customer ${params.id} not found`);
	return { customer: { ...customer } };
};

export const actions = {
	update: async ({ params, request }) => {
		const input = Object.fromEntries(await request.formData());
		const { data, errors } = validateCustomer(input);
		if (Object.keys(errors).length) return fail(422, { values: input, errors });
		if (!(await updateCustomer(params.id, data))) error(404, 'Customer not found');
		redirect(303, `/data?updated=${params.id}`);
	},
	delete: async ({ params }) => {
		if (!(await deleteCustomer(params.id))) error(404, 'Customer not found');
		redirect(303, `/data?deleted=${params.id}`);
	}
};
