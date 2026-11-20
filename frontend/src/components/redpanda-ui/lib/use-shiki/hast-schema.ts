// Copyright 2026 Redpanda Data, Inc.

import type { Element, ElementContent } from 'hast';
import { z } from 'zod';

// Prerender caches are JSON, not trusted TypeScript values. Renderer metadata
// (source positions and parser data) is irrelevant to cached visual markup.
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const propertyListItem = z.union([z.string(), z.number()]);
const property = z.union([scalar, z.array(propertyListItem)]);
const element: z.ZodType<Element> = z.object({
  type: z.literal('element'),
  tagName: z.string(),
  properties: z.record(z.string(), property),
  children: z.lazy(() => z.array(content)),
});
const content: z.ZodType<ElementContent> = z.lazy(() =>
  z.union([
    element,
    z.object({ type: z.literal('text'), value: z.string() }),
    z.object({ type: z.literal('comment'), value: z.string() }),
  ])
);

const doctype = z.object({ type: z.literal('doctype') });
const rootContent = z.union([content, doctype]);
export const hastRootSchema = z.object({
  type: z.literal('root'),
  children: z.array(rootContent),
});
