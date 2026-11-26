import { flushSync } from 'svelte';
import { test } from '../../test';

// the first `getAbortSignal()` happens after the app has updated without one
export default test({
	test({ assert, target, logs }) {
		const [increment, push, toggle] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		flushSync(() => increment.click());
		flushSync(() => push.click());
		assert.htmlEqual(output.innerHTML, '4');
		assert.deepEqual(logs, []);

		flushSync(() => toggle.click());
		assert.htmlEqual(target.querySelector('p')?.innerHTML ?? '', '1');

		flushSync(() => increment.click());
		assert.htmlEqual(target.querySelector('p')?.innerHTML ?? '', '2');
		assert.deepEqual(logs, ['derived 1', 'effect 1']);

		flushSync(() => toggle.click());
		assert.deepEqual(logs, ['derived 1', 'effect 1', 'derived 2', 'effect 2']);
	}
});
