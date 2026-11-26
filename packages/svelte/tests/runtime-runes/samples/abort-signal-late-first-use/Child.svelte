<script lang="ts">
	import { getAbortSignal } from 'svelte';

	let { count } = $props();

	let value = $derived.by(() => {
		const n = count;
		getAbortSignal().addEventListener('abort', () => console.log(`derived ${n}`));
		return n;
	});

	$effect(() => {
		const n = count;
		getAbortSignal().addEventListener('abort', () => console.log(`effect ${n}`));
	});
</script>

<p>{value}</p>
