<script lang="ts">
	let { enable }: { enable: () => void } = $props();

	let count = $state(0);
	let show = $state(false);

	let resolve: (value: string) => void = () => {};
	const promise = new Promise<string>((fulfil) => (resolve = fulfil));

	// async mode turns on while a block of a batch that was created without it re-runs
	function on() {
		enable();
		return true;
	}
</script>

<button onclick={() => { count++; show = true; }}>show</button>
<button onclick={() => count++}>count</button>
<button onclick={() => resolve('resolved')}>resolve</button>

<output>
	<p>{count}</p>

	<svelte:boundary>
		{#if show && on()}
			<p>{await promise} {count}</p>
		{/if}
	</svelte:boundary>
</output>
