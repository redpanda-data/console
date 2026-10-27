import { describe, expect, test } from '@rstest/core';
import { render, screen } from 'test-utils';

import { decodeSchemaEditTarget, schemaEditBreadcrumbs, schemaEditPageStatus } from './schema-edit-page';
import { SchemaEditPageFallback } from './schema-edit-page-fallback';

const EDIT_MODE = { pageTitle: 'Edit Mode', crumbTitle: 'Edit Mode', segment: 'edit-mode' };
const ROOT_CRUMB = { title: 'Schema Registry', linkTo: '/schema-registry' };

describe('decodeSchemaEditTarget', () => {
  test('decodes the subject and context route params', () => {
    expect(decodeSchemaEditTarget('my%2Fsubject', '.staging%20ctx')).toEqual({
      subjectName: 'my/subject',
      contextName: '.staging ctx',
    });
    expect(decodeSchemaEditTarget()).toEqual({ subjectName: undefined, contextName: undefined });
  });
});

describe('schemaEditBreadcrumbs', () => {
  test.each([
    [
      'a context',
      { contextName: '.staging' },
      [{ title: 'Edit Mode', linkTo: '/schema-registry/contexts/.staging/edit-mode' }],
    ],
    [
      'a subject',
      { subjectName: 'orders-value' },
      [
        { title: 'orders-value', linkTo: '/schema-registry/subjects/orders-value' },
        { title: 'Edit Mode', linkTo: '/schema-registry/subjects/orders-value/edit-mode' },
      ],
    ],
    ['the global config', {}, [{ title: 'Edit Mode', linkTo: '/schema-registry/edit-mode' }]],
  ])('links the page for %s', (_label, target, crumbs) => {
    expect(schemaEditBreadcrumbs(target, EDIT_MODE)).toEqual([ROOT_CRUMB, ...crumbs]);
  });

  test('a context wins over a subject', () => {
    expect(schemaEditBreadcrumbs({ subjectName: 'orders-value', contextName: '.staging' }, EDIT_MODE)).toHaveLength(2);
  });
});

describe('schemaEditPageStatus', () => {
  test.each([
    [{ contextsUnsupported: true, isLoading: true, schemaMode: null }, 'contexts-unsupported'],
    [{ contextsUnsupported: false, isLoading: true, schemaMode: null }, 'loading'],
    [{ contextsUnsupported: false, isLoading: false, schemaMode: null }, 'not-configured'],
    [{ contextsUnsupported: false, isLoading: false, schemaMode: undefined }, 'ready'],
    [{ contextsUnsupported: false, isLoading: false, schemaMode: 'READWRITE' }, 'ready'],
  ] as const)('%o is %s', (input, status) => {
    expect(schemaEditPageStatus(input)).toBe(status);
  });
});

describe('schemaEditPageFallback', () => {
  test('explains unsupported contexts', () => {
    render(<SchemaEditPageFallback status="contexts-unsupported" />);

    // PageContent fades its content in, so presence is the observable here.
    expect(screen.getByTestId('contexts-not-supported')).toHaveTextContent('Not Supported');
  });

  test('explains a missing Schema Registry configuration', () => {
    render(<SchemaEditPageFallback status="not-configured" />);

    expect(screen.getByTestId('schema-not-configured')).toHaveTextContent('Not Configured');
  });

  test('shows a skeleton while loading', () => {
    const { container } = render(<SchemaEditPageFallback status="loading" />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
    expect(screen.queryByTestId('contexts-not-supported')).toBeNull();
    expect(screen.queryByTestId('schema-not-configured')).toBeNull();
  });
});
