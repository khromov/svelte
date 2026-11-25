<script lang="ts">
	import { mount } from 'svelte';
	import Inner from './Inner.svelte';

	if (typeof document !== 'undefined') {
		try {
			// while this component is hydrated, `hydrating` is true for the nested app too
			mount(Inner, { target: document.createElement('div') });
		} catch {
			// the nested app fails to hydrate, but that must not affect this one
		}
	}
</script>

<p>outer</p>
<section>second</section>
