<script lang="ts">
	import Child from './Child.svelte';

	let count = $state(0);
	let items = $state([0]);
	let show = $state(false);
</script>

<button onclick={() => count++}>increment</button>
<button onclick={() => items.push(items.length)}>push</button>
<button onclick={() => (show = !show)}>toggle</button>

<output>{count} {items.length}</output>

{#if show}
	<Child {count} />
{/if}
