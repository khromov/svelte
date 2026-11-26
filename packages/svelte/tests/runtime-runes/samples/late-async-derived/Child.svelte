<script lang="ts">
	let { count, push }: { count: number; push: (value: number) => Promise<number> } = $props();

	// a top-level `await`, and a derived that awaits
	const initial = await push(count);
	let double = $derived(await push(count * 2));
</script>

<p>child {initial} {count} {double}</p>
