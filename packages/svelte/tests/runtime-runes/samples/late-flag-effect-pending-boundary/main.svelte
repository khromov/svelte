<script lang="ts">
	let show = $state(false);
	let resolve: (value: number) => void = () => {};
	let promise = new Promise<number>((fulfil) => (resolve = fulfil));
</script>

<button onclick={() => (show = true)}>show</button>
<button onclick={() => resolve(42)}>resolve</button>

<svelte:boundary>
	<output>{$effect.pending()}</output>

	{#if show}
		<p>{await promise}</p>
	{/if}
</svelte:boundary>
