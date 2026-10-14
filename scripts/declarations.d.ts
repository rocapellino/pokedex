declare module 'picomatch' {
  interface PicomatchOptions {
    dot?: boolean;
    [key: string]: unknown;
  }
  function picomatch(patterns: string | string[], options?: PicomatchOptions): (input: string) => boolean;
  export default picomatch;
}
