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
import { Tabs as RpTabs } from '@redpanda-data/ui';

export interface Tab {
    key: string;
    title: React.ReactNode | (() => React.ReactNode);
    content: React.ReactNode | (() => React.ReactNode);
    disabled?: boolean;
}

interface TabsProps {
    tabs: Tab[];
    selectedTabKey?: string;
    defaultSelectedTabKey?: string;
    onChange?: (selectedTabKey: string) => void;

    isFitted?: boolean; // whether or not to fit tab buttons to max width
}


export default function Tabs(props: TabsProps) {
    const { tabs, selectedTabKey, onChange = () => undefined } = props;

    const selectedIndex = selectedTabKey
        ? tabs.findIndex(t => t.key == selectedTabKey)
        : undefined;
    const defaultIndex = props.defaultSelectedTabKey
        ? tabs.findIndex(t => t.key == props.defaultSelectedTabKey)
        : undefined;

    return <>
        <RpTabs
            isFitted={props.isFitted}
            defaultIndex={defaultIndex}
            index={selectedIndex}
            onChange={(_, key) => {
                onChange(key);
            }}
            items={tabs.map(t => {

                const titleComp = t.title;
                const title: React.ReactNode = typeof titleComp == 'function'
                    ? titleComp()
                    : titleComp;

                const contentComp = t.content;
                const content = typeof contentComp == 'function'
                    ? contentComp()
                    : contentComp;

                return {
                    key: t.key,
                    name: title,
                    component: content,
                    isDisabled: t.disabled,
                };
            })}
        />
    </>
}
