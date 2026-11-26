import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// Async mode turns on while a batch that was created without it is waiting to be flushed.
// The batch then takes a write that reveals an `await`, so it has to be held back until the
// promise resolves, like a batch that was created with async
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

		assert.htmlEqual(output.innerHTML, `<p>0</p>`);

		// not flushed yet
		count.click();

		enable_async_mode_flag();

		// joins the same batch
		show.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>0</p>`);
		assert.deepEqual(logs, ['effect 0']);

		resolve.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>1</p><p>resolved 1</p>`);
		assert.deepEqual(logs, ['effect 0', 'effect 1']);

		count.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>2</p><p>resolved 2</p>`);
		assert.deepEqual(logs, ['effect 0', 'effect 1', 'effect 2']);
	}
});
