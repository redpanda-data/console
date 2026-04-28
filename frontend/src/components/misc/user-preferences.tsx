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

import { WrenchIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Text } from 'components/redpanda-ui/components/typography';
import { type FC, useState } from 'react';
import { toast } from 'sonner';

import { clearSettings, uiSettings } from '../../state/ui';
import { Label, navigatorClipboardErrorHandler } from '../../utils/tsx-utils';

type SettingsTabKeys = 'statisticsBar' | 'jsonViewer' | 'importExport' | 'autoRefresh';

const settingsTabs: Record<SettingsTabKeys, { name: string; component: FC }> = {
  statisticsBar: { name: 'Statistics Bar', component: () => <StatsBarTab /> },
  jsonViewer: { name: 'Json Viewer', component: () => <JsonViewerTab /> },
  importExport: { name: 'Import/Export', component: () => <ImportExportTab /> },
  autoRefresh: { name: 'Auto Refresh', component: () => <AutoRefreshTab /> },
};

export const UserPreferencesButton: FC = () => {
  const [isOpen, setOpen] = useState<boolean>(false);
  return (
    <>
      <UserPreferencesDialog isOpen={isOpen} onClose={() => setOpen(false)} />
      <Button aria-label="user preferences" onClick={() => setOpen(true)} size="icon-xs" variant="ghost">
        <WrenchIcon size={18} />
      </Button>
    </>
  );
};

export const UserPreferencesDialog: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const tabEntries = Object.entries(settingsTabs) as [SettingsTabKeys, { name: string; component: FC }][];
  const [activeTab, setActiveTab] = useState<SettingsTabKeys>(tabEntries[0][0]);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="min-h-[50vh]" size="xl" >
        <DialogHeader>
          <DialogTitle>User Preferences</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Tabs onValueChange={(value) => setActiveTab(value as SettingsTabKeys)} value={activeTab}>
            <TabsList>
              {tabEntries.map(([key, { name }]) => (
                <TabsTrigger key={key} value={key}>
                  {name}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabEntries.map(([key, { component: TabComponent }]) => (
              <TabsContent key={key} value={key}>
                <TabComponent />
              </TabsContent>
            ))}
          </Tabs>
        </DialogBody>
        <DialogFooter>
          <Text className="text-muted-foreground" variant="small">
            Changes are saved automatically
          </Text>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const settingsGridStyle = {
  display: 'inline-grid',
  gridAutoFlow: 'row' as const,
  gridRowGap: '24px',
  gridColumnGap: '32px',
  marginRight: 'auto',
};

const StatsBarTab: FC = () => {
  const [topicDetails, setTopicDetails] = useState(uiSettings.topicDetailsShowStatisticsBar);
  const [consumerGroup, setConsumerGroup] = useState(uiSettings.consumerGroupDetails.showStatisticsBar);

  return (
    <div>
      <p>Controls on what pages Redpanda Console shows the statistics bar</p>
      <div style={settingsGridStyle}>
        <Label text="Topic Details">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={topicDetails}
              onCheckedChange={(checked) => {
                const value = checked === true;
                uiSettings.topicDetailsShowStatisticsBar = value;
                setTopicDetails(value);
              }}
            />
            <span className="text-sm">Enabled</span>
          </div>
        </Label>
        <Label text="Consumer Group Details">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={consumerGroup}
              onCheckedChange={(checked) => {
                const value = checked === true;
                uiSettings.consumerGroupDetails.showStatisticsBar = value;
                setConsumerGroup(value);
              }}
            />
            <span className="text-sm">Enabled</span>
          </div>
        </Label>
      </div>
    </div>
  );
};

const JsonViewerTab: FC = () => {
  const settings = uiSettings.jsonViewer;
  const [fontSize, setFontSize] = useState(settings.fontSize);
  const [lineHeight, setLineHeight] = useState(settings.lineHeight);
  const [maxStringLength, setMaxStringLength] = useState(settings.maxStringLength);
  const [collapsed, setCollapsed] = useState(settings.collapsed);

  return (
    <div>
      <p>Settings for the JsonViewer</p>

      <div style={settingsGridStyle}>
        <Label text="Font Size">
          <Input
            className="max-w-[150px]"
            onChange={(e) => {
              settings.fontSize = e.target.value;
              setFontSize(e.target.value);
            }}
            value={fontSize}
          />
        </Label>
        <Label text="Line Height">
          <Input
            className="max-w-[150px]"
            onChange={(e) => {
              settings.lineHeight = e.target.value;
              setLineHeight(e.target.value);
            }}
            value={lineHeight}
          />
        </Label>
        <Label text="Maximum string length before collapsing">
          <Input
            className="max-w-[150px]"
            max={10_000}
            min={0}
            onChange={(e) => {
              const v = Number(e.target.value || 200);
              settings.maxStringLength = v;
              setMaxStringLength(v);
            }}
            type="number"
            value={maxStringLength}
          />
        </Label>
        <Label text="Maximum depth before collapsing nested objects">
          <Input
            className="max-w-[150px]"
            max={50}
            min={1}
            onChange={(e) => {
              const v = Number(e.target.value || 2);
              settings.collapsed = v;
              setCollapsed(v);
            }}
            type="number"
            value={collapsed}
          />
        </Label>
      </div>
    </div>
  );
};

const applyImportedSettings = (parsed: Record<string, unknown>): string[] => {
  const skipped: string[] = [];
  for (const k in parsed) {
    if (!Object.hasOwn(parsed, k)) {
      continue;
    }
    if (Reflect.has(uiSettings, k)) {
      (uiSettings as Record<string, unknown>)[k] = parsed[k];
    } else {
      skipped.push(k);
    }
  }
  return skipped;
};

const ImportExportTab: FC = () => {
  const [importCode, setImportCode] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

  const handleImport = () => {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(importCode);
    } catch (e) {
      toast.error('Unable to import settings. See console for more information.');
      // biome-ignore lint/suspicious/noConsole: error logging for debugging settings import failures
      console.error('unable to import settings', { error: e });
      return;
    }
    if (parsed === null) {
      return;
    }
    const skipped = applyImportedSettings(parsed);
    if (skipped.length > 0) {
      toast.warning(`Some properties were skipped during import:\n${skipped.join(', ')}`);
    } else {
      toast.success('Settings imported');
    }
    setImportCode('');
  };

  return (
    <div className="flex flex-col gap-2">
      <Label text="Import">
        <div className="flex gap-2">
          <Input
            className="max-w-[360px]"
            onChange={(e) => setImportCode(e.target.value)}
            placeholder="Paste a previously exported settings string..."
            spellCheck={false}
            value={importCode}
          />
          <Button onClick={handleImport}>Import</Button>
        </div>
      </Label>

      <Label text="Export">
        <Button
          onClick={() => {
            navigator.clipboard
              .writeText(JSON.stringify(uiSettings))
              .then(() => {
                toast.success('Preferences copied to clipboard');
              })
              .catch(navigatorClipboardErrorHandler);
          }}
        >
          Export User Preferences
        </Button>
      </Label>

      <Label text="Reset">
        <div className="flex items-center gap-2">
          <Input
            className="max-w-[360px]"
            onChange={(str) => setResetConfirm(str.target.value)}
            placeholder='type "reset" here to confirm and enable the button'
            spellCheck={false}
            value={resetConfirm}
          />
          <Button
            disabled={resetConfirm !== 'reset'}
            onClick={() => {
              clearSettings();
              toast.success('All settings have been reset to their defaults');
              setResetConfirm('');
            }}
            variant="destructive"
          >
            Reset
          </Button>
          <span className="smallText">Clear all your user settings, resetting them to the default values</span>
        </div>
      </Label>
    </div>
  );
};

const AutoRefreshTab: FC = () => {
  const [intervalSecs, setIntervalSecs] = useState(uiSettings.autoRefreshIntervalSecs);

  return (
    <div>
      <p>Settings for the Auto Refresh Button</p>
      <div style={settingsGridStyle}>
        <Label text="Interval in seconds">
          <Input
            className="max-w-[150px]"
            max={300}
            min={5}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) {
                uiSettings.autoRefreshIntervalSecs = v;
                setIntervalSecs(v);
              }
            }}
            type="number"
            value={intervalSecs}
          />
        </Label>
      </div>
    </div>
  );
};
