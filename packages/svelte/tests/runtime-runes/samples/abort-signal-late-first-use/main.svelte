<script lang="ts">
	import Child from './Child.svelte';

	let count = $state(0);
	let items = $state([1]);
	let show = $state(false);
	let total = $derived(items.reduce((a, b) => a + b, 0) + count);
</script>

<button onclick={() => count++}>increment</button>
<button onclick={() => items.push(items.length + 1)}>push</button>
<button onclick={() => (show = !show)}>toggle</button>

<output>{total}</output>

{#if show}
	<Child {count} />
{/if}
