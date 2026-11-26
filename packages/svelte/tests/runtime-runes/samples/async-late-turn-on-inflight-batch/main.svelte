<script lang="ts">
	let count = $state(0);
	let show = $state(false);
	let teardown_log = $state('none');

	let resolve: (v: string) => void = () => {};
	let promise = new Promise<string>((f) => (resolve = f));

	$effect(() => {
		count;
		return () => {
			// Reads `count` in teardown view, which must see the reverted value from before
			// the pre-hand-over sync write even after the batch upgrades to async.
			teardown_log = `was:${count}`;
		};
	});
</script>

<button onclick={() => (count = 1)}>write-sync</button>
<button onclick={() => (show = true)}>show-async</button>
<button onclick={() => resolve('done')}>resolve</button>

<output>
	<p>count:{count} teardown:{teardown_log}</p>
	{#if show}
		<span>{await promise}</span>
	{/if}
</output>
