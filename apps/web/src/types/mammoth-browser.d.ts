/**
 * `mammoth` ships types for its Node entry point only. The browser build has
 * the same surface for the one function used here.
 */
declare module 'mammoth/mammoth.browser' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{
    value: string;
    messages: { type: string; message: string }[];
  }>;
}
