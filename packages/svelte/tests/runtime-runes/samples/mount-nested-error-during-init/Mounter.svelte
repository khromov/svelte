<script lang="ts">
	import { mount } from 'svelte';
	import Inner from './Inner.svelte';

	let { report }: { report: (result: string) => void } = $props();

	let target: HTMLElement;

	$effect(() => {
		try {
			mount(Inner, { target });
			report('mount returned');
		} catch (e) {
			report(`mount threw ${(e as Error).message}`);
		}
	});
</script>

<div bind:this={target}></div>
