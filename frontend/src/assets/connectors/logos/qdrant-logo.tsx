import type React from 'react';

export const QdrantLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg fill="currentColor" viewBox="0 0 57 64" xmlns="http://www.w3.org/2000/svg" {...props}>
    <title>Qdrant</title>
    <g clip-path="url(#a)">
      <path
        d="M28.335 0 .62 16v32l27.714 16 10.392-6V46l-10.392 6-17.32-10V22l17.32-10 17.32 10v40l10.393-6V16z"
        fill="#dc244c"
      />
      <path d="M17.943 26v12l10.392 6 10.392-6V26l-10.392-6z" fill="#dc244c" />
      <path d="M38.727 46v12l-10.392 6V52zm17.321-30v40l-10.393 6V22z" fill="#bd0c3e" />
      <path d="m56.048 16-10.393 6-17.32-10-17.32 10L.62 16 28.335 0z" fill="#ff516b" />
      <path d="M28.335 52v12L.62 48V16l10.394 6v20z" fill="#dc244c" />
      <path d="m38.727 26-10.392 6-10.392-6 10.392-6z" fill="#ff516b" />
      <path d="M28.335 32v12l-10.392-6V26z" fill="#dc244c" />
      <path d="M38.727 26v12l-10.392 6V32z" fill="#bd0c3e" />
    </g>
    <defs>
      <clipPath id="a">
        <path d="M.332 0h56v64h-56z" fill="#fff" />
      </clipPath>
    </defs>
  </svg>
);
