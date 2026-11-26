<script lang="ts">
	import Lazy from './Lazy.svelte';

	let count = $state(0);
	let doubled = $derived(count * 2);
	let show = $state(false);
	let resolve: (v: number) => void = () => {};
	let promise = new Promise<number>((f) => (resolve = f));
</script>

<button onclick={() => count++}>inc</button>
<button
	onclick={() => {
		count++;
		show = true;
	}}>show</button
>
<button onclick={() => resolve(42)}>resolve</button>

<svelte:boundary>
	<output>
		<p>count: {count} doubled: {doubled} pending: {$effect.pending()}</p>

		{#if show}
			<Lazy {promise} />
		{/if}
	</output>
</svelte:boundary>
