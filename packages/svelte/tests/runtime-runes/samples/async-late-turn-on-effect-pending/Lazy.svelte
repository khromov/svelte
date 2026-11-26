<script lang="ts">
	let { promise }: { promise: Promise<number> } = $props();
</script>

<span>lazy: {await promise}</span>
