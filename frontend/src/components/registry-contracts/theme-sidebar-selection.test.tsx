// Copyright 2026 Redpanda Data, Inc.

// WARNING: Do not use a sidebar substring selector for selection colors: it also matches the app wrapper and changes contrast across the entire shell.

import { describe, expect, it } from '@rstest/core';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const THEME_CSS = readFileSync(resolve(process.cwd(), 'src/components/redpanda-ui/style/theme.css'), 'utf8');

const CSS_COMMENT = /\/\*[\s\S]*?\*\//gu;
const SIDEBAR_SELECTION_RULE = /(?<selectors>[^{}]*::selection[^{}]*)\{[^}]*--color-sidebar-primary[^}]*\}/u;
const PAGE_SELECTION_RULE = /(?:^|\})\s*::selection\s*\{(?<declarations>[^}]*)\}/u;
const SELECTION_PSEUDO = /::selection$/u;

const withoutComments = (css: string) => css.replace(CSS_COMMENT, '');

const sidebarSelectionSelectors = () => {
  const rule = withoutComments(THEME_CSS).match(SIDEBAR_SELECTION_RULE);
  if (!rule) {
    throw new Error('No ::selection rule setting --color-sidebar-primary found in theme.css');
  }
  return rule[1]
    .split(',')
    .map((selector) => selector.trim().replace(SELECTION_PSEUDO, '').trim())
    .filter(Boolean);
};

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

const matchedBySidebarRule = (id: string, selectors: string[], root: HTMLElement) => {
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

    expect(matchedBySidebarRule('page-heading', selectors, shell)).toBe(false);
    expect(matchedBySidebarRule('page-copy', selectors, shell)).toBe(false);
  });

  it('keeps a page-wide `::selection` rule on the selection tokens', () => {
    const rule = withoutComments(THEME_CSS).match(PAGE_SELECTION_RULE);

    expect(rule?.[1]).toContain('var(--color-selection)');
    expect(rule?.[1]).toContain('var(--color-selection-foreground)');
  });
});
