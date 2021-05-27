import React, { useState } from 'react';
import styles from './Tabs.module.scss'

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
                <ul className={styles.navigationList}>
                    {tabs.map((tab) => (
                        <li key={tab.key}>
                            <a
                                href={`#${encodeURIComponent(tab.key)}`}
                                className={(selectedTab === tab.key) ? styles.active : ''}
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
