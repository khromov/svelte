<script lang="ts">
	import { fork, type Fork } from 'svelte';

	let count = $state(0);
	let double = $derived(count * 2);
	let pending: Fork | null = null;
	let error = $state('');

	function start() {
		try {
			pending = fork(() => {
				count += 1;
			});
		} catch (e) {
			error = (e as Error).message.includes('experimental_async_required') ? 'async required' : 'failed';
		}
	}

	$effect(() => {
		console.log(`effect ${count}`);
	});
</script>

<button onclick={start}>fork</button>
<button onclick={() => pending?.commit()}>commit</button>
<button onclick={() => pending?.discard()}>discard</button>
<button onclick={() => count++}>increment</button>

<output>
	<p>{count} * 2 = {double}</p>

	{#if count > 1}
		<p>more than one</p>
	{/if}

	<p>{error}</p>
</output>
