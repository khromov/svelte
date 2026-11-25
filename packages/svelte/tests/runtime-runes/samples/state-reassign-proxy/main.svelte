<script lang="ts">
	type Item = { n: number };

	class Box {
		field = $state<Item>({ n: 0 });
		#private = $state<Item>({ n: 0 });
		declared: Item;

		constructor() {
			this.declared = $state({ n: 0 });
		}

		get private() {
			return this.#private;
		}

		replace() {
			this.field = { n: 10 };
			this.#private = { n: 10 };
			this.declared = { n: 10 };
		}
	}

	const box = new Box();

	let object = $state<Item>({ n: 0 });
	let maybe = $state<Item | null>(null);
	let a = $state<Item>({ n: 0 });
	let b = $state<Item>({ n: 0 });
	let holder = $state({ item: { n: 0 } });

	function replace() {
		object = { n: 10 };
		maybe ??= { n: 10 };
		[a, b] = [{ n: 10 }, { n: 10 }];
		box.replace();
		Object.defineProperty(holder, 'item', {
			value: { n: 10 },
			configurable: true,
			enumerable: true,
			writable: true
		});
	}
</script>

<button onclick={replace}>replace</button>
<button onclick={() => object.n++}>object</button>
<button onclick={() => maybe && maybe.n++}>maybe</button>
<button onclick={() => a.n++}>a</button>
<button onclick={() => b.n++}>b</button>
<button onclick={() => box.field.n++}>field</button>
<button onclick={() => box.private.n++}>private</button>
<button onclick={() => box.declared.n++}>declared</button>
<button onclick={() => holder.item.n++}>defineProperty</button>

<output>{object.n} {maybe?.n} {a.n} {b.n} {box.field.n} {box.private.n} {box.declared.n} {holder.item.n}</output>
