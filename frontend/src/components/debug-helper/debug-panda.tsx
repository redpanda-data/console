/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Debug-helpers mascot: a flat red panda peering through a magnifying glass,
 * drawn to stay legible from 16px up. Decorative — hosts provide the labels.
 */
export function DebugPanda({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      {/* ears — bases sit inside the head ellipse so the head covers the joint */}
      <path d="M4.6 3.4 12.5 8.8 6 13.5Z" fill="#A34424" />
      <path d="M27.4 3.4 19.5 8.8 26 13.5Z" fill="#A34424" />
      <path d="M5.7 5 10.3 8.1 7 10.6Z" fill="#FCF0E4" />
      <path d="M26.3 5 21.7 8.1 25 10.6Z" fill="#FCF0E4" />
      {/* head */}
      <ellipse cx="16" cy="19" fill="#DE6B35" rx="12.5" ry="11" />
      {/* cream face mask */}
      <ellipse cx="16" cy="24" fill="#FCF0E4" rx="9.5" ry="6" />
      <circle cx="10" cy="14.4" fill="#FCF0E4" r="2.2" />
      {/* sclera behind the magnified eye — reads as the eye seen through the lens */}
      <circle cx="21.4" cy="16.8" fill="#FCF0E4" r="4.3" />
      {/* tear-streak (left only; the lens owns the right side) */}
      <path d="M10.6 20.6c-.4 2-1.2 3.6-2.4 5.2" stroke="#C75B2F" strokeLinecap="round" strokeWidth="2" />
      {/* bare eye (left) */}
      <circle cx="10.4" cy="17" fill="#43241B" r="1.8" />
      <circle cx="11" cy="16.4" fill="#FFFFFF" r="0.6" />
      {/* nose + mouth, nudged left to balance the lens */}
      <path
        d="M13.6 21.6h2.8a.85.85 0 0 1 .66 1.38l-1.4 1.68a.9.9 0 0 1-1.38 0l-1.4-1.68a.85.85 0 0 1 .66-1.38Z"
        fill="#43241B"
      />
      <path d="M13 26c1.35 1 2.65 1 4 0" stroke="#43241B" strokeLinecap="round" strokeWidth="1" />
      {/* magnifying glass over the right eye — the eye behind it drawn magnified */}
      <circle cx="21.6" cy="16.6" fill="#CDE7F2" fillOpacity="0.3" r="6" />
      <circle cx="21.3" cy="17.2" fill="#43241B" r="3.2" />
      <circle cx="22.5" cy="16" fill="#FFFFFF" r="1" />
      <line stroke="#56677A" strokeLinecap="round" strokeWidth="2.5" x1="25.8" x2="29.4" y1="20.8" y2="24.4" />
      <circle cx="21.6" cy="16.6" fill="none" r="6" stroke="#56677A" strokeWidth="2" />
    </svg>
  );
}
