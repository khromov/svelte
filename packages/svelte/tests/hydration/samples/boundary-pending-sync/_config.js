import { test } from '../../test';

// the server renders the pending snippet whenever one is provided, even without
// `experimental.async` — the client must swap it for the actual content on hydration
export default test({});
