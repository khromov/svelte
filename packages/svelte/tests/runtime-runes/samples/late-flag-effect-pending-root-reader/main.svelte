<script lang="ts">
	let show = $state(false);
	let reader = $state(false);
	let resolve: (value: number) => void = () => {};
	let promise = new Promise<number>((fulfil) => (resolve = fulfil));
</script>

<button onclick={() => (show = true)}>show</button>
<button onclick={() => (reader = true)}>reader</button>
<button onclick={() => resolve(42)}>resolve</button>

{#if reader}
	<output>{$effect.pending()}</output>
{/if}

{#if show}
	<p>{await promise}</p>
{/if}
