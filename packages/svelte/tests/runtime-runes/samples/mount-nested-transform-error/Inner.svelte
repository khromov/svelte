<script lang="ts">
	function fail(): string {
		throw 'oops';
	}
</script>

<svelte:boundary>
	{#snippet failed(error)}
		<output>{error}</output>
	{/snippet}

	{fail()}
</svelte:boundary>
