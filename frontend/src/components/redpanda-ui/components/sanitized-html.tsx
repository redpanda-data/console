'use client';

// Copyright 2026 Redpanda Data, Inc.

import { type ComponentPropsWithoutRef, type RefObject, useEffect, useRef } from 'react';

import { cn, type SharedProps } from '../lib/utils';
import { replaceWithSanitizedHtml } from './sanitized-html/html';

function useSanitizedHtml<T extends HTMLElement>(html: string): RefObject<T | null> {
  const elementRef = useRef<T>(null);

  useEffect(
    function syncSanitizedHtml() {
      const element = elementRef.current;
      if (element !== null) {
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
