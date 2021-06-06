import React, { useState } from 'react';
import styles from './Tabs.module.scss';

export interface Tab {
    key: string;
    title: React.ReactNode | (() => React.ReactNode);
    content: React.ReactNode;
    disabled?: boolean;
}

interface TabsProps {
    tabs: Array<Tab>;
    selectedTabKey?: string;
    onChange?: (selectedTabKey: string) => void;
}

function renderContent(tabs: Array<Tab>, key: string) {
    const tab = tabs.find((tab) => tab.key === key);
    return (typeof tab?.content === 'function') ? tab.content() : tab?.content
}

export default function Tabs(props: TabsProps) {
    const { tabs, selectedTabKey, onChange = () => undefined } = props;

    const [selectedTab, setSelectedTab] = useState(selectedTabKey || props.tabs[0].key);

    return (
        <div>
            <nav>
                <ul className={styles.navigationList}>
                    {tabs.map((tab) => (
                        <li key={tab.key}>
                            <a
                                href={`#${encodeURIComponent(tab.key)}`}
                                className={`${selectedTab === tab.key ? styles.active : ''} ${tab.disabled ? styles.disabled : ''}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (tab.disabled) return;
                                    setSelectedTab(tab.key);
                                    onChange(tab.key);
                                }}
                            >
                                {typeof tab.title === 'function' ? tab.title() : tab.title}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <article>{renderContent(tabs, selectedTab)}</article>
        </div>
    );
}
