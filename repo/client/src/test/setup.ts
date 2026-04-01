import '@testing-library/jest-dom';

// Suppress React Router v7 future-flag warnings that clutter test output.
// These are informational deprecation notices, not test failures.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('React Router Future Flag Warning')) return;
  originalWarn.apply(console, args);
};

// Silence React act() warnings in tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Stub service worker API (not available in jsdom)
Object.defineProperty(navigator, 'serviceWorker', {
  writable: true,
  value: {
    controller: null,
    ready: Promise.resolve({
      active: null,
      installing: null,
      waiting: null,
    }),
    register: async () => ({}),
    getRegistration: async () => undefined,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});
