<script lang="ts">
	import Mounter from './Mounter.svelte';

	let result = $state('');
</script>

<svelte:boundary>
	<Mounter report={(r: string) => (result = r)} />

	{#snippet failed()}
		<p>failed</p>
	{/snippet}
</svelte:boundary>

<output>{result}</output>
