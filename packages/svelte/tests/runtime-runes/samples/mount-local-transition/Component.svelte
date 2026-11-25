<script lang="ts">
	function foo(node: Element & { foo?: number }) {
		return {
			duration: 100,
			tick: (t: number) => {
				node.foo = t;
			}
		};
	}
</script>

<p transition:foo>hello</p>
