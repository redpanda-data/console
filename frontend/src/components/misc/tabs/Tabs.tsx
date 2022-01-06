import React, { CSSProperties, useCallback, useEffect, useState } from 'react';
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
    //
    barStyle?: CSSProperties;
    tabButtonStyle?: CSSProperties;
}

function renderContent(tabs: Array<Tab>, key: string) {
    const tab = tabs.find((tab) => tab.key === key);
    return (typeof tab?.content === 'function') ? tab.content() : tab?.content;
}

// function classNames(obj: { [className: string]: boolean | null | undefined }) {
//     let str = '';
//     for (const [name, active] of Object.entries(obj))
//         if (active)
//             str += name + ' ';
//     return str;
// }

function getClass(active: boolean, disabled: boolean | undefined) {
    if (active) return styles.active;
    if (disabled) return styles.disabled;
    return styles.default;
}


export default function Tabs(props: TabsProps) {
    const { tabs, selectedTabKey, extra, onChange = () => undefined } = props;

    const [selectedTab, setSelectedTab] = useState(selectedTabKey || props.defaultSelectedTabKey || props.tabs[0].key);
    return (
        <div style={props.wrapperStyle} >
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
            <article>{renderContent(tabs, selectedTab)}</article>
        </div>
    );
}
