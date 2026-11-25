<script lang="ts">
	import { mount, unmount } from 'svelte';
	import Component from './Component.svelte';

	let el: HTMLElement;
	let instance: Record<string, any>;
</script>

<div bind:this={el}></div>

<button onclick={() => (instance = mount(Component, { target: el, intro: true }))}>mount</button>
<button onclick={() => unmount(instance, { outro: true })}>unmount</button>
