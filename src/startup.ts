type Startup = {
  ready(): void;
  fail(): void;
  theme(value: string): void;
};

declare global {
  interface Window { __CYBERNOTE_STARTUP__?: Startup }
}

export const startup = {
  ready() { window.__CYBERNOTE_STARTUP__?.ready(); },
  fail() { window.__CYBERNOTE_STARTUP__?.fail(); },
  theme(value: string) { window.__CYBERNOTE_STARTUP__?.theme(value); },
};
