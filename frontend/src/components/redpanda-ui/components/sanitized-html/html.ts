'use client';

// Copyright 2026 Redpanda Data, Inc.

import DOMPurify from 'dompurify';

/** Escapes text before embedding it in a trusted HTML wrapper. */
export function escapeHtmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function replaceWithSanitizedHtml(element: HTMLElement, html: string): void {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  });
  element.replaceChildren(fragment);
}
