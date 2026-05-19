import type React from 'react';

/**
 * Apache Iceberg brand mark — circular badge with a faceted low-poly iceberg
 * (light sky band above the waterline, deep blue water below). Modelled after
 * the official Apache Iceberg logo. Kept inline so it scales cleanly and tints
 * are stable across themes.
 */
export const IcebergLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" {...props}>
    <title>Apache Iceberg</title>
    {/* Water (lower half of the badge) */}
    <path d="M128 256a128 128 0 0 0 128-128H0a128 128 0 0 0 128 128Z" fill="#2E7AB8" />
    {/* Sky (upper half of the badge) */}
    <path d="M128 0a128 128 0 0 0-128 128h256A128 128 0 0 0 128 0Z" fill="#B7D8E8" />

    {/* Iceberg — above-water cap */}
    <g>
      {/* Flat top of the cap (lightest face) */}
      <path d="M99 128 117 109 168 116 158 128Z" fill="#EAF4FA" />
      {/* Left face of the cap (light) */}
      <path d="M99 128 117 109 124 128Z" fill="#D3E7F1" />
      {/* Right face of the cap (slightly shaded) */}
      <path d="M124 128 117 109 168 116 158 128Z" fill="#C7DEEC" />
    </g>

    {/* Iceberg — below-water body, multiple low-poly facets */}
    <g>
      {/* Largest light facet (centre-left) */}
      <path d="M99 128 124 128 142 174 124 224 99 215 88 175Z" fill="#BBD9E8" />
      {/* Lighter highlight facet (upper-left) */}
      <path d="M99 128 88 175 124 195 124 128Z" fill="#D3E7F1" />
      {/* Bottom-left tip */}
      <path d="M99 215 124 224 124 245 110 245Z" fill="#A6CADE" />
      {/* Centre vertical facet */}
      <path d="M124 128 142 174 158 145 158 128Z" fill="#6FAFD0" />
      {/* Centre-right facet */}
      <path d="M158 128 158 145 174 168 184 152 168 128Z" fill="#4C95C3" />
      {/* Right shoulder facet (darker) */}
      <path d="M158 145 174 168 165 198 142 174Z" fill="#3D85B5" />
      {/* Right slope */}
      <path d="M174 168 184 152 184 192 165 198Z" fill="#5AA0CB" />
      {/* Bottom-centre facet */}
      <path d="M142 174 165 198 158 230 132 240 124 224Z" fill="#4C95C3" />
      {/* Bottom-right facet */}
      <path d="M165 198 184 192 178 220 158 230Z" fill="#3D85B5" />
      {/* Tip at bottom */}
      <path d="M132 240 158 230 145 245Z" fill="#2E7AB8" />
    </g>
  </svg>
);
