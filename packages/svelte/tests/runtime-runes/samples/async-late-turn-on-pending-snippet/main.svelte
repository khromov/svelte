<script lang="ts">
	let show_new = $state(false);
	let fail_existing = $state(false);
	let async_existing = $state(false);

	let resolve_a: (v: string) => void = () => {};
	let promise_a = new Promise<string>((f) => (resolve_a = f));

	let resolve_b: (v: string) => void = () => {};
	let promise_b = new Promise<string>((f) => (resolve_b = f));

	function maybe_throw(): string {
		if (fail_existing) throw new Error('boom');
		return 'ok';
	}
</script>

<button onclick={() => (fail_existing = true)}>fail</button>
<button
	onclick={() => {
		fail_existing = false;
		async_existing = true;
	}}>prepare-reset</button
>
<button onclick={() => (show_new = true)}>show-new</button>
<button onclick={() => resolve_a('A')}>resolve-a</button>
<button onclick={() => resolve_b('B')}>resolve-b</button>

<output>
	<svelte:boundary>
		{#if async_existing}
			<p>reset: {await promise_b}</p>
		{:else}
			<p>sync: {maybe_throw()}</p>
		{/if}

		{#snippet pending()}
			<p>existing-pending</p>
		{/snippet}

		{#snippet failed(_, reset)}
			<button class="reset" onclick={reset}>reset</button>
		{/snippet}
	</svelte:boundary>

	{#if show_new}
		<svelte:boundary>
			<p>new: {await promise_a}</p>

			{#snippet pending()}
				<p>new-pending</p>
			{/snippet}
		</svelte:boundary>
	{/if}
</output>
