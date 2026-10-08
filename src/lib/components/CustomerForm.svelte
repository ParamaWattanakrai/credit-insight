<script lang="ts">
	import { enhance } from '$app/forms';
	import { COLUMNS, type Customer } from '$lib/schema';

	interface Props {
		values?: Customer | Record<string, unknown>;
		errors?: Record<string, string>;
		submitLabel: string;
		action?: string;
	}
	let { values = {}, errors = {}, submitLabel, action = '' }: Props = $props();

	const groups = ['Profile', 'Card', 'Spending', 'Balance & Payments', 'Engagement'] as const;
	const fields = COLUMNS.filter((c) => c.type !== 'id');
	let submitting = $state(false);
</script>

<form
	method="POST"
	{action}
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update({ reset: false });
			submitting = false;
		};
	}}
>
	{#if Object.keys(errors).length}
		<div class="error-banner" role="alert">Please fix {Object.keys(errors).length} field{Object.keys(errors).length > 1 ? 's' : ''} below.</div>
	{/if}

	{#each groups as g}
		<fieldset class="card">
			<legend>{g}</legend>
			<div class="fields">
				{#each fields.filter((f) => f.group === g) as f}
					<label class:invalid={errors[f.key]}>
						<span>
							{f.label}
							{#if f.ratio}<em>(0–1)</em>{:else if f.unit && f.unit !== 'amt'}<em>({f.unit})</em>{/if}
						</span>
						{#if f.type === 'enum'}
							<select name={f.key} value={values[f.key] ?? ''} required>
								<option value="" disabled>Select…</option>
								{#each f.options ?? [] as o}
									<option value={o}>{o}</option>
								{/each}
							</select>
						{:else}
							<input
								name={f.key}
								type="number"
								inputmode="decimal"
								value={values[f.key] ?? ''}
								min={f.min}
								max={f.max}
								step={f.step ?? (f.type === 'int' ? 1 : 0.01)}
								required
							/>
						{/if}
						{#if errors[f.key]}<small>{errors[f.key]}</small>{/if}
					</label>
				{/each}
			</div>
		</fieldset>
	{/each}

	<div class="actions">
		<a class="btn" href="/data">Cancel</a>
		<button class="btn primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</button>
	</div>
</form>

<style>
	form {
		display: grid;
		gap: 16px;
	}
	fieldset {
		margin: 0;
	}
	legend {
		font-weight: 620;
		padding: 0 6px;
		margin-left: -6px;
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 14px 18px;
	}
	label {
		display: grid;
		gap: 4px;
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	label em {
		font-style: normal;
		color: var(--muted);
	}
	label.invalid input,
	label.invalid select {
		border-color: var(--danger);
	}
	small {
		color: var(--danger);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		position: sticky;
		bottom: 0;
		padding: 12px 0;
		background: linear-gradient(transparent, var(--page) 30%);
	}
	.error-banner {
		background: var(--danger-soft);
		color: var(--danger);
		padding: 10px 14px;
		border-radius: 8px;
		font-weight: 550;
	}
</style>
