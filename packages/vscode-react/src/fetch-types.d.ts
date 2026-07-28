/**
 * `@mybcabisnis/mage-sdk`'s generated fetch client (workspace TS source, not a
 * precompiled npm package) references the DOM-standard `BodyInit` type name.
 * We deliberately do NOT add the full "DOM" lib to this program's
 * compilerOptions to get it: DOM lib's global `fetch`/`RequestInit`
 * declarations merge with (and conflict against) @types/node's own fetch
 * typing, breaking existing Buffer-bodied fetch() calls elsewhere in this
 * extension. Declaring just the type name we need avoids that merge entirely.
 */
export {};

declare global {
  type BodyInit = Blob | BufferSource | FormData | URLSearchParams | ReadableStream<Uint8Array> | string;
}
