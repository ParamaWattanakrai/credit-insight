<script lang="ts">
	import CustomerForm from '$lib/components/CustomerForm.svelte';
	let { form } = $props();
</script>

<svelte:head><title>New customer · Credit Insight</title></svelte:head>

<div class="page-head">
	<div>
		<a href="/data" class="muted">← Data</a>
		<h1>New customer</h1>
		<p>A new Customer ID is assigned automatically. The row is appended to the Excel file as soon as you save.</p>
	</div>
</div>

<CustomerForm values={form?.values} errors={form?.errors} submitLabel="Create customer" />
