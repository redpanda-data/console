/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import Tabs, { type Tab } from './tabs';

const testTabs: Tab[] = [
  {
    key: 'test1',
    title: 'test title 1',
    content: () => 'test content 1',
  },
  {
    key: 'test2',
    title: 'test title 2',
    content: 'test content 2',
  },
  {
    key: 'test3',
    title: 'test title 3',
    content: 'test content 3',
    disabled: true,
  },
];

describe('Tabs', () => {
  test('renders a single tab with string title and content', () => {
    render(<Tabs tabs={testTabs.slice(0, 1)} />);

    expect(screen.getByText('test title 1')).toBeInTheDocument();
    expect(screen.getByText('test content 1')).toBeInTheDocument();
  });

  test('renders an initial tab other than the first', () => {
    render(<Tabs selectedTabKey="test2" tabs={testTabs.slice(0, 2)} />);

    expect(screen.getByText('test title 2')).toBeInTheDocument();
    expect(screen.getByText('test content 2')).toBeInTheDocument();
  });

  test('renders the wanted tab after switching to it', () => {
    render(<Tabs tabs={testTabs.slice(0, 2)} />);

    expect(screen.getByText('test content 1')).toBeInTheDocument();
    expect(screen.queryByText('test content 2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('test title 2'));

    expect(screen.getByText('test content 2')).toBeInTheDocument();
    expect(screen.queryByText('test content 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('test title 1'));

    expect(screen.getByText('test content 1')).toBeInTheDocument();
    expect(screen.queryByText('test content 2')).not.toBeInTheDocument();
  });

  test('does not switch tabs when wanted key is disabled', () => {
    render(<Tabs tabs={testTabs.slice(0, 3)} />);

    fireEvent.click(screen.getByText('test title 3'));

    expect(screen.queryByText('test content 3')).not.toBeInTheDocument();
    expect(screen.getByText('test content 1')).toBeInTheDocument();
  });

  test('executes onChange callback when active tab changes', () => {
    const onChange = vi.fn();

    render(<Tabs onChange={onChange} tabs={testTabs.slice(0, 2)} />);

    fireEvent.click(screen.getByText('test title 2'));

    expect(onChange).toHaveBeenCalled();
  });

  test('accepts a function as tab title', () => {
    const tabs = testTabs
      .slice(0, 1)
      .map((tab) => ({ ...tab, title: () => <span data-testid="title-function-span" /> }));
    render(<Tabs tabs={tabs} />);

    expect(screen.getByTestId('title-function-span')).toBeInTheDocument();
  });

  test('accepts a function as tab content', () => {
    const tabs = testTabs
      .slice(0, 1)
      .map((tab) => ({ ...tab, content: () => <span data-testid="content-function-span" /> }));
    render(<Tabs tabs={tabs} />);

    expect(screen.getByTestId('content-function-span')).toBeInTheDocument();
  });
});
