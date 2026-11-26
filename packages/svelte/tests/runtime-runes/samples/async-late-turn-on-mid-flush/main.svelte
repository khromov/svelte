<script lang="ts">
	let { enable }: { enable: () => void } = $props();

	let step = $state(0);
	let load = $state(false);

	let resolve: (v: string) => void = () => {};
	let promise = new Promise<string>((f) => (resolve = f));

	$effect(() => {
		if (step === 1 && !load) {
			enable();
			load = true;
		}
	});
</script>

<button onclick={() => (step = 1)}>trigger</button>
<button onclick={() => resolve('loaded')}>resolve</button>

<output>
	<p>step:{step}</p>
	{#if load}
		<span>{await promise}</span>
	{/if}
</output>
