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

import {
  Button,
  Checkbox,
  Flex,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  Tabs,
  Text,
  useToast,
} from '@redpanda-data/ui';
import { transaction } from 'mobx';
import { observer, useLocalObservable } from 'mobx-react';
import { Component, type FC, useState } from 'react';
import { FaWrench } from 'react-icons/fa';

import { clearSettings, uiSettings } from '../../state/ui';
import { Label, navigatorClipboardErrorHandler } from '../../utils/tsx-utils';

type SettingsTabKeys = 'statisticsBar' | 'jsonViewer' | 'importExport' | 'autoRefresh';

const settingsTabs: Record<SettingsTabKeys, { name: string; component: FC }> = {
  statisticsBar: { name: 'Statistics Bar', component: () => <StatsBarTab /> },
  jsonViewer: { name: 'Json Viewer', component: () => <JsonViewerTab /> },
  importExport: { name: 'Import/Export', component: () => <ImportExportTab /> },
  autoRefresh: { name: 'Auto Refresh', component: () => <AutoRefreshTab /> },
  // pagination position
  // messageSearch: { name: "Message Search", component: () => <MessageSearchTab /> },
};

export const UserPreferencesButton: FC = () => {
  const [isOpen, setOpen] = useState<boolean>(false);
  return (
    <>
      <UserPreferencesDialog isOpen={isOpen} onClose={() => setOpen(false)} />
      <IconButton
        aria-label="user preferences"
        icon={<FaWrench size={17} />}
        onClick={() => setOpen(true)}
        variant="ghost"
      />
    </>
  );
};

export const UserPreferencesDialog: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal isCentered isOpen={isOpen} onClose={onClose}>
    <ModalOverlay />
    <ModalContent minH="50vh" minW="5xl">
      <ModalHeader>User Preferences</ModalHeader>
      <ModalBody>
        <Tabs
          items={Object.entries(settingsTabs).map(([key, { name, component: TabComponent }]) => ({
            name,
            component: <TabComponent />,
            key,
          }))}
        />
      </ModalBody>
      <ModalFooter alignItems="center" gap={2} justifyContent="flex-end">
        <Text color="gray.500" fontSize="xs">
          Changes are saved automatically
        </Text>
        <Button onClick={onClose}>Close</Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

@observer
class StatsBarTab extends Component {
  render() {
    return (
      <div>
        <p>Controls on what pages Redpanda Console shows the statistics bar</p>
        <div
          style={{
            display: 'inline-grid',
            gridAutoFlow: 'row',
            gridRowGap: '24px',
            gridColumnGap: '32px',
            marginRight: 'auto',
          }}
        >
          <Label text="Topic Details">
            <Checkbox
              isChecked={uiSettings.topicDetailsShowStatisticsBar}
              onChange={(e) => (uiSettings.topicDetailsShowStatisticsBar = e.target.checked)}
            >
              Enabled
            </Checkbox>
          </Label>
          <Label text="Consumer Group Details">
            <Checkbox
              isChecked={uiSettings.consumerGroupDetails.showStatisticsBar}
              onChange={(e) => (uiSettings.consumerGroupDetails.showStatisticsBar = e.target.checked)}
            >
              Enabled
            </Checkbox>
          </Label>
        </div>
      </div>
    );
  }
}

@observer
class JsonViewerTab extends Component {
  render() {
    const settings = uiSettings.jsonViewer;

    return (
      <div>
        <p>Settings for the JsonViewer</p>

        <div
          style={{
            display: 'inline-grid',
            gridAutoFlow: 'row',
            gridRowGap: '24px',
            gridColumnGap: '32px',
            marginRight: 'auto',
          }}
        >
          <Label text="Font Size">
            <Input maxWidth={150} onChange={(e) => (settings.fontSize = e.target.value)} value={settings.fontSize} />
          </Label>
          <Label text="Line Height">
            <Input
              maxWidth={150}
              onChange={(e) => (settings.lineHeight = e.target.value)}
              value={settings.lineHeight}
            />
          </Label>
          <Label text="Maximum string length before collapsing">
            <NumberInput
              max={10_000}
              maxWidth={150}
              min={0}
              onChange={(e) => (settings.maxStringLength = Number(e ?? 200))}
              value={settings.maxStringLength}
            />
          </Label>
          <Label text="Maximum depth before collapsing nested objects">
            <NumberInput
              max={50}
              maxWidth={150}
              min={1}
              onChange={(e) => (settings.collapsed = Number(e ?? 2))}
              value={settings.collapsed}
            />
          </Label>
        </div>
      </div>
    );
  }
}

const ImportExportTab: FC = observer(() => {
  const toast = useToast();
  const $state = useLocalObservable<{
    importCode: string;
    resetConfirm: string;
  }>(() => ({
    importCode: '',
    resetConfirm: '',
  }));
  return (
    <Flex flexDirection="column" gap={2}>
      <Label text="Import">
        <Flex gap={2}>
          <Input
            maxWidth={360}
            onChange={(e) => ($state.importCode = e.target.value)}
            placeholder="Paste a previously exported settings string..."
            spellCheck={false}
            value={$state.importCode}
          />
          <Button
            onClick={() => {
              try {
                const data = JSON.parse($state.importCode);
                const skipped: string[] = [];
                transaction(() => {
                  for (const k in data) {
                    if (Reflect.has(uiSettings, k)) {
                      (uiSettings as Record<string, unknown>)[k] = data[k];
                    } else {
                      skipped.push(k);
                    }
                  }
                });
                if (skipped.length > 0) {
                  toast({
                    status: 'warning',
                    description: `Some properties were skipped during import:\n${skipped.join(', ')}`,
                  });
                } else {
                  toast({
                    status: 'success',
                    description: 'Settings imported successfully',
                  });
                }
                $state.importCode = '';
              } catch (e) {
                toast({
                  status: 'error',
                  description: 'Unable to import settings. See console for more information.',
                });
                // biome-ignore lint/suspicious/noConsole: error logging for debugging settings import failures
                console.error('unable to import settings', { error: e });
              }
            }}
          >
            Import
          </Button>
        </Flex>
      </Label>

      <Label text="Export">
        <Button
          onClick={() => {
            navigator.clipboard
              .writeText(JSON.stringify(uiSettings))
              .then(() => {
                toast({
                  status: 'success',
                  description: 'Preferences copied to clipboard!',
                });
              })
              .catch(navigatorClipboardErrorHandler);
          }}
        >
          Export User Preferences
        </Button>
      </Label>

      <Label text="Reset">
        <Flex alignItems="center" gap={2}>
          <Input
            maxWidth={360}
            onChange={(str) => ($state.resetConfirm = str.target.value)}
            placeholder='type "reset" here to confirm and enable the button'
            spellCheck={false}
            value={$state.resetConfirm}
          />
          <Button
            colorScheme="red"
            isDisabled={$state.resetConfirm !== 'reset'}
            onClick={() => {
              clearSettings();
              toast({
                status: 'success',
                description: 'All settings have been reset to their defaults',
              });
              $state.resetConfirm = '';
            }}
          >
            Reset
          </Button>
          <span className="smallText">Clear all your user settings, resetting them to the default values</span>
        </Flex>
      </Label>
    </Flex>
  );
});

@observer
class AutoRefreshTab extends Component {
  render() {
    return (
      <div>
        <p>Settings for the Auto Refresh Button</p>
        <div
          style={{
            display: 'inline-grid',
            gridAutoFlow: 'row',
            gridRowGap: '24px',
            gridColumnGap: '32px',
            marginRight: 'auto',
          }}
        >
          <Label text="Interval in seconds">
            <NumberInput
              max={300}
              maxWidth={150}
              min={5}
              onChange={(e) => {
                if (e) {
                  uiSettings.autoRefreshIntervalSecs = Number(e);
                }
              }}
              value={uiSettings.autoRefreshIntervalSecs}
            />
          </Label>
        </div>
      </div>
    );
  }
}
