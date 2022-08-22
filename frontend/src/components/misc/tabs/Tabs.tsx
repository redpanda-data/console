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

import React, { CSSProperties, useState } from 'react';
import styles from './Tabs.module.scss';

export interface Tab {
    key: string;
    title: React.ReactNode | (() => React.ReactNode);
    content: React.ReactNode | (() => React.ReactNode);
    disabled?: boolean;
}

interface TabsProps {
    tabs: Array<Tab>;
    selectedTabKey?: string;
    defaultSelectedTabKey?: string;
    onChange?: (selectedTabKey: string) => void;

    // Only makes sense when you also set "tabButtonStyle={{ maxWidth: '150px' }}".
    // Renders the given element in the empty space on the right.
    extra?: JSX.Element;

    // The wrapper around the whole tabs control, header bar and content.
    wrapperStyle?: CSSProperties;
    // nav bar
    barStyle?: CSSProperties;
    // tab header buttons
    tabButtonStyle?: CSSProperties;
    // the '<article>' element the content is rendered in
    contentStyle?: CSSProperties;
}

function renderContent(tabs: Array<Tab>, key: string): JSX.Element {
    const tab = tabs.find((tab) => tab.key === key);
    if (!tab || !tab.content) return <></>;
    let content = tab.content;

    if (typeof content === 'function' && content.length === 0)
        content = content();
    if (React.isValidElement(content))
        return content;

    return <>{content}</>
}

function getClass(active: boolean, disabled: boolean | undefined) {
    if (active) return styles.active;
    if (disabled) return styles.disabled;
    return styles.default;
}


export default function Tabs(props: TabsProps) {
    const { tabs, selectedTabKey, extra, onChange = () => undefined } = props;

    const [selectedTab, setSelectedTab] = useState(selectedTabKey || props.defaultSelectedTabKey || props.tabs[0].key);
    return (
        <div className={styles.wrapper} style={props.wrapperStyle} >
            <nav>
                <ul className={styles.navigationList} style={props.barStyle}>
                    {tabs.map((tab) => {
                        const selected = (selectedTab == tab.key);
                        const names = getClass(selected, tab.disabled);
                        return <li key={tab.key} style={props.tabButtonStyle}>
                            <div className={styles.tabHeaderButton + ' ' + names} onClick={(e) => {
                                e.preventDefault();
                                if (tab.disabled) return;
                                setSelectedTab(tab.key);
                                onChange(tab.key);
                            }}>
                                {typeof tab.title === 'function' ? tab.title() : tab.title}
                            </div>
                        </li>
                    })}
                    {extra && <li className={styles.extra}>{extra}</li>}
                </ul>
            </nav>
            <article className={styles.content} style={props.contentStyle}>{renderContent(tabs, selectedTab)}</article>
        </div>
    );
}
