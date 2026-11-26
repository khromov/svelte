<script lang="ts">
	import { fork, type Fork } from 'svelte';

	let tab = $state('home');
	let items = $state(['a', 'b']);
	let upper = $derived(tab.toUpperCase());

	let resolve_away: (v: string) => void = () => {};
	let promise_away = new Promise<string>((f) => (resolve_away = f));

	let resolve_next: (v: string) => void = () => {};
	let promise_next = new Promise<string>((f) => (resolve_next = f));

	let active_fork: Fork | null = null;
	let error_msg = $state('');

	function try_sync_fork() {
		try {
			fork(() => {
				tab = 'blocked';
			});
		} catch (err) {
			error_msg = (err as Error).message.includes('experimental_async_required')
				? 'threw'
				: 'other';
		}
	}
</script>

<button onclick={try_sync_fork}>try-sync-fork</button>
<button
	onclick={() => {
		active_fork = fork(() => {
			tab = 'away';
			items = ['x'];
		});
	}}>fork-away</button
>
<button onclick={() => active_fork?.discard()}>discard</button>
<button
	onclick={() => {
		active_fork = fork(() => {
			tab = 'next';
			items = ['c', 'd'];
		});
	}}>fork-next</button
>
<button onclick={() => resolve_away('away-data')}>resolve-away</button>
<button onclick={() => resolve_next('next-data')}>resolve-next</button>
<button onclick={() => active_fork?.commit()}>commit</button>

<output>
	<p>{upper}:{error_msg}</p>
	<ul>
		{#each items as item (item)}
			<li>{item}</li>
		{/each}
	</ul>
	{#if tab === 'away'}
		<span>{await promise_away}</span>
	{:else if tab === 'next'}
		<span>{await promise_next}</span>
	{/if}
</output>
