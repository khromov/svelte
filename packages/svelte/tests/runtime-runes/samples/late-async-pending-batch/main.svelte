<script lang="ts">
	let count = $state(0);
	let show = $state(false);

	let resolve: (value: string) => void = () => {};
	const promise = new Promise<string>((fulfil) => (resolve = fulfil));

	$effect(() => {
		console.log(`effect ${count}`);
	});
</script>

<button onclick={() => count++}>count</button>
<button onclick={() => (show = true)}>show</button>
<button onclick={() => resolve('resolved')}>resolve</button>

<output>
	<p>{count}</p>

	<svelte:boundary>
		{#if show}
			<p>{await promise} {count}</p>
		{/if}
	</svelte:boundary>
</output>
