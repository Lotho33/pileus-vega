// base-64 ships without types (it's already a dependency, for Shaka's
// polyfills); only what core/avatarCache.ts uses.
declare module 'base-64' {
  export function encode(input: string): string;
  export function decode(input: string): string;
}
