// Copyright 2026 Redpanda Data, Inc.

/**
 * Holds the registry-synced theme.css to scoping the sidebar's `::selection` pair at the sidebar.
 *
 * Registry v3.0.0–3.0.1 scoped it with `[data-slot*='sidebar']`. That substring match also catches
 * `sidebar-wrapper` (SidebarProvider's div, which wraps the whole app) and `sidebar-inset` (the main
 * content region), so every highlight in the app painted the sidebar's indigo at 4.82:1 instead of
 * `selection`'s wash. Fixed upstream in 3.0.2 and covered there by `theme-selection-scope.test.ts`;
 * this is the consumer-side half, because the shape that triggers it is ours — the registry's own
 * docs site doesn't mount its content inside SidebarProvider.
 *
 * A pull overwrites theme.css wholesale, and a re-broadened selector is a contrast regression that
 * typechecks, lints and builds clean. Assert the behaviour, not the spelling: read the rule out of
 * theme.css and check what it matches against console's real shell (routes/__root.tsx,
 * components/layout/sidebar.tsx).
 */

import { describe, expect, it } from '@rstest/core';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Test commands run from the frontend root.
const THEME_CSS = readFileSync(resolve(process.cwd(), 'src/components/redpanda-ui/style/theme.css'), 'utf8');

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
/** The rule is found by its declaration, so it survives upstream rewording the scoping. */
const SIDEBAR_SELECTION_RULE = /([^{}]*::selection[^{}]*)\{[^}]*--color-sidebar-primary[^}]*\}/;
/** A `::selection` rule with no selector in front of it — the page-wide one. */
const PAGE_SELECTION_RULE = /(?:^|})\s*::selection\s*\{([^}]*)\}/;
const SELECTION_PSEUDO = /::selection$/;

/** Comments mention `::selection` in prose, so they'd otherwise land inside a selector capture. */
const withoutComments = (css: string): string => css.replace(CSS_COMMENT, '');

/** The selector list of the `::selection` rule that paints the sidebar pair. */
const sidebarSelectionSelectors = (): string[] => {
  const rule = withoutComments(THEME_CSS).match(SIDEBAR_SELECTION_RULE);
  if (!rule) {
    throw new Error('No ::selection rule setting --color-sidebar-primary found in theme.css');
  }
  return rule[1]
    .split(',')
    .map((selector) => selector.trim().replace(SELECTION_PSEUDO, '').trim())
    .filter(Boolean);
};

/** Console's shell: the provider wraps both the sidebar and every page. */
const renderShell = () => {
  const wrapper = document.createElement('div');
  wrapper.dataset.slot = 'sidebar-wrapper';
  wrapper.innerHTML = `
    <div data-slot="sidebar">
      <div data-slot="sidebar-container">
        <div data-sidebar="sidebar" data-slot="sidebar-inner">
          <div data-sidebar="content"><a href="/topics" id="nav-link">Topics</a></div>
        </div>
      </div>
    </div>
    <main data-slot="sidebar-inset">
      <div class="container"><h1 id="page-heading">Topics</h1><p id="page-copy">Some prose.</p></div>
    </main>
  `;
  document.body.append(wrapper);
  return wrapper;
};

const matchedBySidebarRule = (id: string, selectors: string[], root: HTMLElement): boolean => {
  const element = root.querySelector(`#${id}`);
  if (!element) {
    throw new Error(`Fixture is missing #${id}`);
  }
  return selectors.some((selector) => element.matches(selector));
};

describe('theme.css sidebar ::selection scoping', () => {
  it('paints the sidebar pair on sidebar chrome', () => {
    const selectors = sidebarSelectionSelectors();
    const shell = renderShell();

    expect(matchedBySidebarRule('nav-link', selectors, shell)).toBe(true);
  });

  it('leaves page content on the `selection` tokens', () => {
    const selectors = sidebarSelectionSelectors();
    const shell = renderShell();

    // Both would match again under `[data-slot*='sidebar']`.
    expect(matchedBySidebarRule('page-heading', selectors, shell)).toBe(false);
    expect(matchedBySidebarRule('page-copy', selectors, shell)).toBe(false);
  });

  it('keeps a page-wide `::selection` rule on the selection tokens', () => {
    const rule = withoutComments(THEME_CSS).match(PAGE_SELECTION_RULE);

    expect(rule?.[1]).toContain('var(--color-selection)');
    expect(rule?.[1]).toContain('var(--color-selection-foreground)');
  });
});
