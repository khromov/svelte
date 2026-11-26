<script lang="ts">
	let show = $state(false);
	let value = $state(1);
	let resolvers: Array<() => void> = [];

	function push(value: number) {
		return new Promise<number>((fulfil) => resolvers.push(() => fulfil(value)));
	}
</script>

<button onclick={() => (show = true)}>show</button>
<button onclick={() => value++}>increment</button>
<button onclick={() => resolvers.shift()?.()}>shift</button>

<output>
	<svelte:boundary>
		<p>pending: {$effect.pending()}</p>

		{#if show}
			<p>{await push(value)}</p>
		{/if}
	</svelte:boundary>
</output>
