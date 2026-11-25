import { flushSync } from 'svelte';
import { test } from '../../test';

// every kind of reassignment of `$state` makes the new value deeply reactive
export default test({
	test({ assert, target }) {
		const [replace, ...increments] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.htmlEqual(output.innerHTML, '0  0 0 0 0 0 0');

		flushSync(() => replace.click());
		assert.htmlEqual(output.innerHTML, '10 10 10 10 10 10 10 10');

		const values = increments.map(() => 10);

		// one at a time, so that nothing else triggers the update
		for (let i = 0; i < increments.length; i += 1) {
			flushSync(() => increments[i].click());
			values[i] += 1;
			assert.htmlEqual(output.innerHTML, values.join(' '), increments[i].textContent ?? '');
		}
	}
});
