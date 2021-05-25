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
    const { getByText, queryByText } = render(<Tabs tabs={testTabs.slice(0, 2)} disabledTabKeys={["test2"]} />)

    fireEvent.click(getByText('test title 2'));

    expect(queryByText('test content 2')).not.toBeInTheDocument()
    expect(getByText('test content 1')).toBeInTheDocument();
})
