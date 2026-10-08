import { fail, redirect } from '@sveltejs/kit';
import { createCustomer } from '$lib/server/store';
import { validateCustomer } from '$lib/schema';

export const actions = {
	default: async ({ request }) => {
		const input = Object.fromEntries(await request.formData());
		const { data, errors } = validateCustomer(input);
		if (Object.keys(errors).length) return fail(422, { values: input, errors });
		const c = await createCustomer(data);
		redirect(303, `/data?created=${c.Customer_ID}`);
	}
};
