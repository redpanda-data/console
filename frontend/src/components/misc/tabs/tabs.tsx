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

import { Tabs as RegistryTabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import type React from 'react';

type Slot = React.ReactNode | (() => React.ReactNode);

export type Tab = {
  key: string;
  title: Slot;
  content: Slot;
  disabled?: boolean;
};

type TabsProps = {
  tabs: Tab[];
  selectedTabKey?: string;
  defaultSelectedTabKey?: string;
  onChange?: (selectedTabKey: string) => void;

  isFitted?: boolean;
};

const renderSlot = (slot: Slot) => (typeof slot === 'function' ? slot() : slot);

const TabSlot = ({ slot }: { slot: Slot }) => <>{renderSlot(slot)}</>;

/**
 * Only the active panel evaluates its content.
 */
export default function Tabs({ tabs, selectedTabKey, defaultSelectedTabKey, onChange, isFitted }: TabsProps) {
  return (
    <RegistryTabs
      defaultValue={selectedTabKey || defaultSelectedTabKey || tabs[0]?.key}
      onValueChange={(next, details) => {
        // WARNING: Do not call onChange for fallback selection reported by Base UI; only user selection should notify the caller.
        if (details.reason === 'none' && next !== null) {
          onChange?.(String(next));
        }
      }}
    >
      <TabsList activateOnFocus layout={isFitted ? 'full' : 'auto'} variant="underline">
        {tabs.map((t) => (
          <TabsTrigger disabled={t.disabled} key={t.key} value={t.key} variant="underline">
            {renderSlot(t.title)}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key}>
          <div className="pt-2 pb-4">
            <TabSlot slot={t.content} />
          </div>
        </TabsContent>
      ))}
    </RegistryTabs>
  );
}
