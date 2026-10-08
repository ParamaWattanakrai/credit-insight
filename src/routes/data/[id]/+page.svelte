<script lang="ts">
	import CustomerForm from '$lib/components/CustomerForm.svelte';
	let { data, form } = $props();
	const id = $derived(String(data.customer.Customer_ID));
</script>

<svelte:head><title>{id} · Credit Insight</title></svelte:head>

<div class="page-head">
	<div>
		<a href="/data" class="muted">← Data</a>
		<h1>Edit {id}</h1>
		<p>Changes are written back to the same row in the Excel file.</p>
	</div>
	<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete ${id}? This removes the row from the Excel file.`)) e.preventDefault(); }}>
		<button class="btn danger" type="submit">Delete customer</button>
	</form>
</div>

<CustomerForm action="?/update" values={form?.values ?? data.customer} errors={form?.errors} submitLabel="Save changes" />
