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

  isFitted?: boolean; // whether or not to fit tab buttons to max width
};

const renderSlot = (slot: Slot) => (typeof slot === 'function' ? slot() : slot);

// Only the active panel renders its children, so function content runs for one tab.
const TabSlot = ({ slot }: { slot: Slot }) => <>{renderSlot(slot)}</>;

export default function Tabs({ tabs, selectedTabKey, defaultSelectedTabKey, onChange, isFitted }: TabsProps) {
  return (
    <RegistryTabs
      defaultValue={selectedTabKey || defaultSelectedTabKey || tabs[0]?.key}
      onValueChange={(next) => onChange?.(String(next))}
    >
      <TabsList activateOnFocus layout={isFitted ? 'full' : 'auto'} variant="underline">
        {tabs.map((t) => (
          <TabsTrigger disabled={t.disabled} key={t.key} value={t.key} variant="underline">
            {renderSlot(t.title)}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        // Legacy tab bodies space themselves; keep Chakra's 1rem panel padding, drop the registry rhythm.
        <TabsContent className="space-y-0 pt-2 pb-4" key={t.key} value={t.key}>
          <TabSlot slot={t.content} />
        </TabsContent>
      ))}
    </RegistryTabs>
  );
}
