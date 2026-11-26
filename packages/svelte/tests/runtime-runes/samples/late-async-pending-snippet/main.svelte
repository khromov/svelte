<script lang="ts">
	let inner = $state(false);
	let direct = $state(false);
	let value = $state(1);
	let resolvers: Array<() => void> = [];

	function push(value: number) {
		return new Promise<number>((fulfil) => resolvers.push(() => fulfil(value)));
	}
</script>

<button onclick={() => (inner = true)}>inner</button>
<button onclick={() => (direct = true)}>direct</button>
<button onclick={() => value++}>increment</button>
<button onclick={() => resolvers.shift()?.()}>shift</button>

<output>
	<svelte:boundary>
		<p>outer {value}</p>

		{#if inner}
			<svelte:boundary>
				<p>inner {await push(value)}</p>

				{#snippet pending()}
					<p>inner pending</p>
				{/snippet}
			</svelte:boundary>
		{/if}

		{#if direct}
			<p>direct {await push(value * 10)}</p>
		{/if}

		{#snippet pending()}
			<p>outer pending</p>
		{/snippet}
	</svelte:boundary>
</output>
