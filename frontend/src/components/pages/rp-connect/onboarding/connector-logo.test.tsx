import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import type { SVGProps } from 'react';

import { ConnectorLogo } from './connector-logo';

const FallbackLogo = (props: SVGProps<SVGSVGElement>) => <svg {...props} aria-label="Fallback connector" role="img" />;

test('uses the registered logo rather than the fallback for a known connector', () => {
  const { container } = render(<ConnectorLogo fallback={FallbackLogo} name="kafka" />);
  expect(container.querySelector('svg')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Fallback connector' })).not.toBeInTheDocument();
});

test.each(['not-a-registered-connector', 'constructor'])(
  'uses the fallback for %s without treating inherited properties as logos',
  (name) => {
    render(<ConnectorLogo fallback={FallbackLogo} name={name} />);
    expect(screen.getByRole('img', { name: 'Fallback connector' })).toBeInTheDocument();
  }
);

test('omits an unknown logo when no fallback is supplied', () => {
  const { container } = render(<ConnectorLogo name="not-a-registered-connector" />);
  expect(container).toBeEmptyDOMElement();
});
