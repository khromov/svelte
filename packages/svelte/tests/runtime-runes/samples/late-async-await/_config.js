import { flushSync, tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// The app is mounted while async mode is off. It turns on afterwards, as it would when a
// component that uses `await` is loaded lazily. What was created before (state, a derived,
// an effect, a block, a boundary) has to keep working, next to the async work that follows
export default test({
	mode: ['client'],
	compileOptions: { experimental: { async: true } },

	before_test() {
		disable_async_mode_flag();
	},

	// (the suite's mode decides, not the value the flag had: importing this sample turned it on)
	after_test() {
		if (async_mode) enable_async_mode_flag();
		else disable_async_mode_flag();
	},

	async test({ assert, target, logs }) {
		const [count, show, resolve] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.htmlEqual(output.innerHTML, `<p>0 * 2 = 0</p><p>even</p>`);
		assert.deepEqual(logs, ['effect 0']);

		count.click();
		flushSync();
		assert.htmlEqual(output.innerHTML, `<p>1 * 2 = 2</p><p>odd</p>`);
		assert.deepEqual(logs, ['effect 0', 'teardown 0', 'effect 2']);

		enable_async_mode_flag();

		// what was created without async still updates
		count.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>2 * 2 = 4</p><p>even</p>`);
		assert.deepEqual(logs, ['effect 0', 'teardown 0', 'effect 2', 'teardown 2', 'effect 4']);

		// the batch that reveals the `await` is held back until the promise resolves...
		show.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>2 * 2 = 4</p><p>even</p>`);

		// ...which doesn't hold back an unrelated change
		count.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>3 * 2 = 6</p><p>odd</p>`);

		resolve.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>3 * 2 = 6</p><p>odd</p><p>resolved 3</p>`);

		count.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>4 * 2 = 8</p><p>even</p><p>resolved 4</p>`);

		assert.deepEqual(logs, [
			'effect 0',
			'teardown 0',
			'effect 2',
			'teardown 2',
			'effect 4',
			'teardown 4',
			'effect 6',
			'teardown 6',
			'effect 8'
		]);
	}
});
