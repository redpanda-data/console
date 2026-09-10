/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

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
import { Label as CheckboxLabel } from 'components/redpanda-ui/components/label';
import { PortalContainerProvider } from 'components/redpanda-ui/lib/use-portal-container';
import { type FC, useState } from 'react';

import type { ColumnList, TimestampDisplayFormat } from '../../../../../state/ui';
import { useTopicSettingsStore } from '../../../../../stores/topic-settings-store';
import { Label, TimestampDisplay } from '../../../../../utils/tsx-utils';
import { SingleSelect } from '../../../../misc/select';

const COLUMN_SETTINGS: ColumnList[] = [
  { title: 'Offset', dataIndex: 'offset' },
  { title: 'Partition', dataIndex: 'partitionID' },
  { title: 'Timestamp', dataIndex: 'timestamp' },
  { title: 'Key', dataIndex: 'key' },
  { title: 'Value', dataIndex: 'value' },
  { title: 'Key Size', dataIndex: 'keySize' },
  { title: 'Value Size', dataIndex: 'valueSize' },
];

export const ColumnSettings: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
  topicName: string;
}> = ({ getShowDialog, setShowDialog, topicName }) => {
  const { perTopicSettings, setTopicSettings, getTopicSettings } = useTopicSettingsStore();
  const topicSettings = perTopicSettings.find((t) => t.topicName === topicName);
  const previewColumnFields = topicSettings?.previewColumnFields ?? [];
  const previewTimestamps = topicSettings?.previewTimestamps ?? 'default';
  const [previewTime] = useState(() => Date.now());
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setShowDialog(false);
        }
      }}
      open={getShowDialog()}
    >
      {/* `xl` is `sm:max-w-4xl`, matching the Chakra modal's `minW="4xl"`. */}
      <DialogContent size="xl">
        {/* The timestamp select portals in here, inside the dialog's focus lock, as Chakra's did. */}
        {/* A flex column, or DialogBody's `flex-1` and its scrolling go inert. */}
        <div className="flex min-h-0 flex-col" ref={setContainer}>
          <PortalContainerProvider value={container ?? undefined}>
            {/* Room for DialogContent's close button. */}
            <DialogHeader className="pr-10">
              <DialogTitle>Column Settings</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p>Choose which columns will be shown in the messages table, as well as the format of the timestamp.</p>
              <div className="my-6">
                <Label text="Columns shown">
                  <div className="flex flex-row gap-5">
                    {COLUMN_SETTINGS.map(({ title, dataIndex }) => (
                      <div className="flex items-center gap-2" key={dataIndex}>
                        <Checkbox
                          checked={previewColumnFields.some((x) => x.dataIndex === dataIndex)}
                          id={`column-${dataIndex}`}
                          onCheckedChange={(checkedState) => {
                            const checked = checkedState === true;
                            const currentFields = getTopicSettings(topicName)?.previewColumnFields ?? [];

                            let newFields: ColumnList[];
                            if (checked) {
                              // Add column if not already present (prevent duplicates)
                              newFields = currentFields.some((f) => f.dataIndex === dataIndex)
                                ? currentFields
                                : [...currentFields, { title, dataIndex }];
                            } else {
                              // Remove column
                              newFields = currentFields.filter((x) => x.dataIndex !== dataIndex);
                            }

                            setTopicSettings(topicName, { previewColumnFields: newFields });
                          }}
                        />
                        {/* Chakra's Checkbox took its label as a child and wired it; the Registry's does not. */}
                        <CheckboxLabel className="cursor-pointer" htmlFor={`column-${dataIndex}`}>
                          {title}
                        </CheckboxLabel>
                      </div>
                    ))}
                  </div>
                </Label>
                <Button
                  className="mt-2 p-0"
                  onClick={() => {
                    setTopicSettings(topicName, { previewColumnFields: [] });
                  }}
                  variant="link"
                >
                  Clear
                </Button>
              </div>
              <div className="my-6 grid grid-cols-[1fr_2fr] gap-4">
                <div>
                  <Label text="Timestamp format">
                    <SingleSelect<TimestampDisplayFormat>
                      onChange={(e) => {
                        setTopicSettings(topicName, { previewTimestamps: e });
                      }}
                      options={[
                        { label: 'Local DateTime', value: 'default' },
                        { label: 'Unix DateTime', value: 'unixTimestamp' },
                        { label: 'Relative', value: 'relative' },
                        { label: 'Local Date', value: 'onlyDate' },
                        { label: 'Local Time', value: 'onlyTime' },
                        { label: 'Unix Millis', value: 'unixMillis' },
                      ]}
                      value={previewTimestamps}
                    />
                  </Label>
                </div>
                <div>
                  <Label text="Preview">
                    <TimestampDisplay format={previewTimestamps} unixEpochMillisecond={previewTime} />
                  </Label>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                onClick={() => {
                  setShowDialog(false);
                }}
                variant="destructive"
              >
                Close
              </Button>
            </DialogFooter>
          </PortalContainerProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
};
