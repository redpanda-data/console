declare module '*.yaml' {
  const content: Record<string, unknown>;
  export default content;
}

declare module '*.yaml?raw' {
  const content: string;
  export default content;
}
