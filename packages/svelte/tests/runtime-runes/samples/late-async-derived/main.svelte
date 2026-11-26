<script lang="ts">
	import Child from './Child.svelte';

	let count = $state(1);
	let show = $state(false);
	let resolvers: Array<() => void> = [];

	function push(value: number) {
		return new Promise<number>((fulfil) => resolvers.push(() => fulfil(value)));
	}
</script>

<button onclick={() => (show = !show)}>toggle</button>
<button onclick={() => count++}>increment</button>
<button onclick={() => resolvers.shift()?.()}>shift</button>

<output>
	<p>parent {count}</p>

	<svelte:boundary>
		{#if show}
			<Child {count} {push} />
		{/if}

		{#snippet failed(error)}
			<p>failed</p>
		{/snippet}
	</svelte:boundary>
</output>
