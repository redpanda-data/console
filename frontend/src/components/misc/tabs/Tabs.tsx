import React, { useState } from 'react';

export interface Tab {
    key: string;
    title: JSX.Element | string;
    content: JSX.Element | string;
}

interface TabsProps {
    tabs: Array<Tab>;
    disabledTabKeys?: Array<string>;
    selectedTabKey?: string;
}

export default function Tabs(props: TabsProps) {
    const { tabs, selectedTabKey, disabledTabKeys = [] } = props;

    const [selectedTab, setSelectedTab] = useState(selectedTabKey || props.tabs[0].key);

    return (
        <div>
            <nav>
                <ul>
                    {tabs.map((tab) => (
                        <li key={tab.key}>
                            <a
                                href={`#${encodeURIComponent(tab.key)}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (disabledTabKeys.find((key) => key === tab.key) != undefined) {
                                        return;
                                    }
                                    setSelectedTab(tab.key);
                                }}
                            >
                                {tab.title}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <article>{tabs.find((tab) => tab.key === selectedTab)?.content}</article>
        </div>
    );
}
