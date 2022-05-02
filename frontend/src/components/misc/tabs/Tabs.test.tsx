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

import React from 'react';
import Tabs, { Tab } from './Tabs';
import { render, fireEvent } from '@testing-library/react';

const testTabs: Array<Tab> = [
    {
        key: 'test1',
        title: 'test title 1',
        content: 'test content 1',
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

it('renders a single tab with string title and content', () => {
    const { getByText } = render(<Tabs tabs={testTabs.slice(0, 1)} />);

    expect(getByText('test title 1')).toBeInTheDocument();
    expect(getByText('test content 1')).toBeInTheDocument();
});

it('renders an initial tab other than the first', () => {
    const { getByText } = render(<Tabs tabs={testTabs.slice(0, 2)} selectedTabKey="test2" />);

    expect(getByText('test title 2')).toBeInTheDocument();
    expect(getByText('test content 2')).toBeInTheDocument();
});

it('renders the wanted tab after switching to it', () => {
    const { getByText, queryByText } = render(<Tabs tabs={testTabs.slice(0, 2)} />);

    expect(getByText('test content 1')).toBeInTheDocument();
    expect(queryByText('test content 2')).not.toBeInTheDocument();

    fireEvent.click(getByText('test title 2'));

    expect(getByText('test content 2')).toBeInTheDocument();
    expect(queryByText('test content 1')).not.toBeInTheDocument();

    fireEvent.click(getByText('test title 1'));

    expect(getByText('test content 1')).toBeInTheDocument();
    expect(queryByText('test content 2')).not.toBeInTheDocument();
});

it('does not switch tabs when wanted key is disabled', () => {
    const { getByText, queryByText } = render(<Tabs tabs={testTabs.slice(0, 3)} />);

    fireEvent.click(getByText('test title 3'));

    expect(queryByText('test content 3')).not.toBeInTheDocument();
    expect(getByText('test content 1')).toBeInTheDocument();
});

it('executes onChange callback when active tab changes', () => {
    const onChange = jest.fn();

    const { getByText } = render(<Tabs tabs={testTabs.slice(0, 2)} onChange={onChange} />);

    fireEvent.click(getByText('test title 2'));

    expect(onChange).toHaveBeenCalled();
});

it('accepts a function as tab title', () => {
    const tabs = testTabs.slice(0, 1).map((tab) => ({ ...tab, title: () => <span data-testid="title-function-span" /> }));
    const { getByTestId } = render(<Tabs tabs={tabs} />);

    expect(getByTestId('title-function-span')).toBeInTheDocument();
});

it('accepts a function as tab content', () => {
    const tabs = testTabs.slice(0, 1).map((tab) => ({ ...tab, content: () => <span data-testid="content-function-span" /> }));
    const { getByTestId } = render(<Tabs tabs={tabs} />);

    expect(getByTestId('content-function-span')).toBeInTheDocument();
})
