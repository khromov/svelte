import { flushSync, tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// Mounts `$state`, `$derived`, `{#if}` and `{#each}` with async off, turns async on, and verifies
// speculative `fork()` discard and commit against state and blocks created on the sync runtime.
export default test({
	mode: ['client'],
	compileOptions: { experimental: { async: true } },

	before_test() {
		disable_async_mode_flag();
	},

	after_test() {
		if (async_mode) enable_async_mode_flag();
		else disable_async_mode_flag();
	},

	async test({ assert, target }) {
		const [try_sync, fork_away, discard, fork_next, resolve_away, resolve_next, commit] =
			target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.equal(async_mode_flag, false);
		assert.htmlEqual(output.innerHTML, '<p>HOME:</p><ul><li>a</li><li>b</li></ul>');

		// Before async turns on, `fork()` rejects with `experimental_async_required`
		flushSync(() => try_sync.click());
		assert.htmlEqual(output.innerHTML, '<p>HOME:threw</p><ul><li>a</li><li>b</li></ul>');

		// Turn async on and create a fork that is then discarded
		enable_async_mode_flag();
		fork_away.click();
		resolve_away.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>HOME:threw</p><ul><li>a</li><li>b</li></ul>');

		discard.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>HOME:threw</p><ul><li>a</li><li>b</li></ul>');

		// Create a second fork, resolve its async work, and commit it
		fork_next.click();
		resolve_next.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>HOME:threw</p><ul><li>a</li><li>b</li></ul>');

		commit.click();
		await tick();
		assert.htmlEqual(
			output.innerHTML,
			'<p>NEXT:threw</p><ul><li>c</li><li>d</li></ul><span>next-data</span>'
		);
	}
});
