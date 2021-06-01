import React, { useState } from 'react';
import styles from './Tabs.module.scss';

export interface Tab {
    key: string;
    title: React.ReactNode;
    content: React.ReactNode;
    disabled?: boolean;
}

interface TabsProps {
    tabs: Array<Tab>;
    selectedTabKey?: string;
    onChange?: (selectedTabKey: string) => void;
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
