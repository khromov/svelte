<script lang="ts">
	import { mount } from 'svelte';
	import Inner from './Inner.svelte';

	let a: HTMLElement;
	let b: HTMLElement;
	let c: HTMLElement;

	$effect(() => {
		mount(Inner, { target: a });
		mount(Inner, { target: b, transformError: null as any });
		mount(Inner, { target: c, transformError: (error) => `inner ${error}` });
	});
</script>

<div bind:this={a}></div>
<div bind:this={b}></div>
<div bind:this={c}></div>
