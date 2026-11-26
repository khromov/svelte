import { flushSync, tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// `fork()` is not available while async mode is off. Once it is on, state, a derived, an
// effect and a block that were created before take part in forks like any other
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
		const [fork, commit, discard, increment] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.htmlEqual(output.innerHTML, `<p>0 * 2 = 0</p><p></p>`);

		fork.click();
		flushSync();
		assert.htmlEqual(output.innerHTML, `<p>0 * 2 = 0</p><p>async required</p>`);

		enable_async_mode_flag();

		// a fork changes nothing that can be seen...
		fork.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>0 * 2 = 0</p><p>async required</p>`);
		assert.deepEqual(logs, ['effect 0']);

		// ...until it is committed
		commit.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>1 * 2 = 2</p><p>async required</p>`);
		assert.deepEqual(logs, ['effect 0', 'effect 1']);

		// a discarded fork leaves no trace
		fork.click();
		await tick();
		discard.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>1 * 2 = 2</p><p>async required</p>`);
		assert.deepEqual(logs, ['effect 0', 'effect 1']);

		// a fork that selects a new branch of a block from before
		fork.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>1 * 2 = 2</p><p>async required</p>`);

		commit.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>2 * 2 = 4</p><p>more than one</p><p>async required</p>`);

		increment.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>3 * 2 = 6</p><p>more than one</p><p>async required</p>`);
		assert.deepEqual(logs, ['effect 0', 'effect 1', 'effect 2', 'effect 3']);
	}
});
