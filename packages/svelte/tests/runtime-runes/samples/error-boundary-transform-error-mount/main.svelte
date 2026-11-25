<script lang="ts">
	let show = $state(false);

	function fail(): string {
		throw 'oops';
	}
</script>

<button onclick={() => (show = true)}>show</button>

<svelte:boundary>
	{#snippet failed(error)}
		<output>outer {error}</output>
	{/snippet}

	{#if show}
		<svelte:boundary>
			{#snippet failed(error)}
				<output>inner {error}</output>
			{/snippet}

			{fail()}
		</svelte:boundary>
	{/if}
</svelte:boundary>
