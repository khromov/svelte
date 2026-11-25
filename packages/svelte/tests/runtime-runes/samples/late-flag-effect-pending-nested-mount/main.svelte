<script lang="ts">
	import { mount, unmount } from 'svelte';
	import Inner from './Inner.svelte';

	let target: HTMLElement;

	$effect(() => {
		const app = mount(Inner, { target });
		return () => unmount(app);
	});
</script>

<div bind:this={target}></div>
