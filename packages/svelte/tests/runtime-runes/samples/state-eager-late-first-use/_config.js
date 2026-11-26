import { flushSync, tick } from 'svelte';
import { test } from '../../test';

// the first `$state.eager(...)` is created after the app has updated without one
export default test({
	compileOptions: {
		dev: true
	},

	async test({ assert, target }) {
		const [increment, push, toggle] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		flushSync(() => increment.click());
		flushSync(() => push.click());
		assert.htmlEqual(output.innerHTML, '1 2');

		flushSync(() => toggle.click());
		assert.htmlEqual(target.querySelector('p')?.innerHTML ?? '', '1');

		increment.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '2 2');
		assert.htmlEqual(target.querySelector('p')?.innerHTML ?? '', '2');
	}
});
