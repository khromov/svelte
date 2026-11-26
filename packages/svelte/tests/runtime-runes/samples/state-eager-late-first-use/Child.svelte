<script lang="ts">
	let { count } = $props();
</script>

<p>{$state.eager(count)}</p>
