'use client';

// Copyright 2026 Redpanda Data, Inc.

import DOMPurify from 'dompurify';
import { type ComponentPropsWithoutRef, type RefObject, useEffect, useRef } from 'react';

import { cn, type SharedProps } from '../lib/utils';

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

function useSanitizedHtml<T extends HTMLElement>(html: string): RefObject<T | null> {
  const elementRef = useRef<T>(null);

  useEffect(
    function syncSanitizedHtml() {
      const element = elementRef.current;
      if (element) {
        replaceWithSanitizedHtml(element, html);
      }
    },
    [html]
  );

  return elementRef;
}

function stripUnsafeHtmlProps<T extends object>(props: T): T {
  Reflect.deleteProperty(props, 'children');
  Reflect.deleteProperty(props, 'dangerouslySetInnerHTML');
  return props;
}

interface SanitizedHtmlProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'dangerouslySetInnerHTML'>,
    SharedProps {
  html: string;
}

/** Renders trusted display markup only after DOMPurify has removed executable content. */
export function SanitizedHtml({ className, html, testId, ...props }: SanitizedHtmlProps) {
  const elementRef = useSanitizedHtml<HTMLDivElement>(html);
  const safeProps = stripUnsafeHtmlProps(props);

  return <div className={cn(className)} data-testid={testId} ref={elementRef} {...safeProps} />;
}

interface SanitizedCodeProps
  extends Omit<ComponentPropsWithoutRef<'code'>, 'children' | 'dangerouslySetInnerHTML'>,
    SharedProps {
  html: string;
}

export function SanitizedCode({ className, html, testId, ...props }: SanitizedCodeProps) {
  const elementRef = useSanitizedHtml<HTMLElement>(html);
  const safeProps = stripUnsafeHtmlProps(props);

  return <code className={cn(className)} data-testid={testId} ref={elementRef} {...safeProps} />;
}
