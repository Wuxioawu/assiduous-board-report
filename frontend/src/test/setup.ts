import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react's own auto-cleanup only registers itself when it
// detects a global test-runner `afterEach` - vitest.config.ts runs with
// `globals: false`, so that detection never fires and every render() call
// would otherwise leak its DOM into the next test.
afterEach(() => {
  cleanup();
});
