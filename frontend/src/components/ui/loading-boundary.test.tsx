import { expect, test } from '@rstest/core';
import { act, render, screen } from '@testing-library/react';
import { lazy } from 'react';

import { LoadingBoundary } from './loading-boundary';

test('shows the fallback immediately, reveals loaded content, and preserves its DOM structure', async () => {
  let resolveContent: (module: { default: () => React.JSX.Element }) => void;
  const loaded = new Promise<{ default: () => React.JSX.Element }>((resolve) => {
    resolveContent = resolve;
  });
  const Content = lazy(() => loaded);
  const { container } = render(
    <LoadingBoundary fallback={<p role="status">Loading editor</p>}>
      <Content />
    </LoadingBoundary>
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading editor');

  await act(async () => {
    resolveContent({ default: () => <textarea aria-label="Message value" defaultValue="Ready" /> });
    await loaded;
  });
  const editor = screen.getByRole('textbox', { name: 'Message value' });
  expect(editor).toHaveValue('Ready');
  expect(editor.parentElement).toBe(container);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('already available content renders without a fallback or extra wrapper', () => {
  const { container } = render(
    <LoadingBoundary fallback={<p role="status">Loading editor</p>}>
      <textarea aria-label="Message value" defaultValue="Cached" />
    </LoadingBoundary>
  );
  expect(screen.getByRole('textbox', { name: 'Message value' }).parentElement).toBe(container);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
