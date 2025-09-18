declare module 'downdoc' {
  interface DowndocOptions {
    attributes?: Record<string, string>;
  }

  function downdoc(asciidoc: string, options?: DowndocOptions): string;

  export default downdoc;
}
