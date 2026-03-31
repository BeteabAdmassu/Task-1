import '@testing-library/jest-dom';

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
