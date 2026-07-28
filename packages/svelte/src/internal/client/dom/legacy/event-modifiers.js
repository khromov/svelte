import { noop } from '../../../shared/utils.js';
import { user_pre_effect } from '../../reactivity/effects.js';
import { on } from '../elements/events.js';

/**
 * Substitute for the `trusted` event modifier
 * @deprecated
 * @param {(event: Event, ...args: Array<unknown>) => void} fn
 * @returns {(event: Event, ...args: unknown[]) => void}
 */
export function trusted(fn) {
	return function (...args) {
		var event = /** @type {Event} */ (args[0]);
		if (event.isTrusted) {
			// @ts-ignore
			fn?.apply(this, args);
		}
	};
}

/**
 * Substitute for the `self` event modifier
 * @deprecated
 * @param {(event: Event, ...args: Array<unknown>) => void} fn
 * @returns {(event: Event, ...args: unknown[]) => void}
 */
export function self(fn) {
	return function (...args) {
		var event = /** @type {Event} */ (args[0]);
		// @ts-ignore
		if (event.target === this) {
			// @ts-ignore
			fn?.apply(this, args);
		}
	};
}

/**
 * @param {'stopPropagation' | 'stopImmediatePropagation' | 'preventDefault'} method
 * @returns {(fn: (event: Event, ...args: Array<unknown>) => void) => (event: Event, ...args: unknown[]) => void}
 */
function create_modifier(method) {
	return (fn) =>
		function (...args) {
			var event = /** @type {Event} */ (args[0]);
			event[method]();
			// @ts-ignore
			return fn?.apply(this, args);
		};
}

/**
 * @param {boolean} passive
 * @returns {(node: HTMLElement, options: [event: string, handler: () => EventListener]) => void}
 */
function create_passive_modifier(passive) {
	return (node, [event, handler]) => {
		user_pre_effect(() => {
			return on(node, event, handler() ?? noop, {
				passive
			});
		});
	};
}

/**
 * Substitute for the `stopPropagation` event modifier
 * @deprecated
 */
export const stopPropagation = /* @__PURE__ */ create_modifier('stopPropagation');

/**
 * Substitute for the `once` event modifier
 * @deprecated
 * @param {(event: Event, ...args: Array<unknown>) => void} fn
 * @returns {(event: Event, ...args: unknown[]) => void}
 */
export function once(fn) {
	var ran = false;

	return function (...args) {
		if (ran) return;
		ran = true;

		// @ts-ignore
		return fn?.apply(this, args);
	};
}

/**
 * Substitute for the `stopImmediatePropagation` event modifier
 * @deprecated
 */
export const stopImmediatePropagation = /* @__PURE__ */ create_modifier('stopImmediatePropagation');

/**
 * Substitute for the `preventDefault` event modifier
 * @deprecated
 */
export const preventDefault = /* @__PURE__ */ create_modifier('preventDefault');

/**
 * Substitute for the `passive` event modifier, implemented as an action
 * @deprecated
 */
export const passive = /* @__PURE__ */ create_passive_modifier(true);

/**
 * Substitute for the `nonpassive` event modifier, implemented as an action
 * @deprecated
 */
export const nonpassive = /* @__PURE__ */ create_passive_modifier(false);
