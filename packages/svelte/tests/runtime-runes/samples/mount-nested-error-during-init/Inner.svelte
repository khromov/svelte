<script lang="ts">
	let x = $state(0);

	// the callback runs (and throws) synchronously when `x` changes, and the error
	// goes through the effect tree, looking for a boundary to handle it
	$inspect(x).with((type) => {
		if (type === 'update') throw new Error('inspect');
	});

	x = 1;
</script>

<p>inner</p>
