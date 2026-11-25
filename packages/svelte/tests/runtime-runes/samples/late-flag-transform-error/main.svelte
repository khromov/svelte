<script lang="ts">
	let show = $state(false);
	let reject: (error: unknown) => void = () => {};
	let promise = new Promise<number>((_, r) => (reject = r));
</script>

<button onclick={() => (show = true)}>show</button>
<button onclick={() => reject('oops')}>reject</button>

{#if show}
	<svelte:boundary>
		<p>{await promise}</p>

		{#snippet pending()}
			<p>loading</p>
		{/snippet}

		{#snippet failed(error)}
			<output>{error}</output>
		{/snippet}
	</svelte:boundary>
{/if}
