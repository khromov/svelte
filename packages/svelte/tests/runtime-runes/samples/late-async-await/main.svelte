<script lang="ts">
	let count = $state(0);
	let show = $state(false);
	let double = $derived(count * 2);

	let resolve: (value: string) => void = () => {};
	const promise = new Promise<string>((fulfil) => (resolve = fulfil));

	$effect(() => {
		console.log(`effect ${double}`);
		return () => console.log(`teardown ${double}`);
	});
</script>

<button onclick={() => count++}>count</button>
<button onclick={() => (show = true)}>show</button>
<button onclick={() => resolve('resolved')}>resolve</button>

<output>
	<p>{count} * 2 = {double}</p>

	{#if count % 2 === 1}
		<p>odd</p>
	{:else}
		<p>even</p>
	{/if}

	<svelte:boundary>
		{#if show}
			<p>{await promise} {count}</p>
		{/if}
	</svelte:boundary>
</output>
