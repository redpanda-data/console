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

import {
  Box,
  Button,
  Checkbox,
  Grid,
  GridItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@redpanda-data/ui';
import type { FC } from 'react';

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

  return (
    <Modal
      isOpen={getShowDialog()}
      onClose={() => {
        setShowDialog(false);
      }}
    >
      <ModalOverlay />
      <ModalContent minW="4xl">
        <ModalHeader>Column Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text>Choose which columns will be shown in the messages table, as well as the format of the timestamp.</Text>
          <Box my={6}>
            <Label text="Columns shown">
              <Stack direction="row" spacing={5}>
                {COLUMN_SETTINGS.map(({ title, dataIndex }) => (
                  <Checkbox
                    isChecked={previewColumnFields.some((x) => x.dataIndex === dataIndex)}
                    key={dataIndex}
                    onChange={({ target: { checked } }) => {
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
                    size="lg"
                  >
                    {title}
                  </Checkbox>
                ))}
              </Stack>
            </Label>
            <Button
              mt={2}
              onClick={() => {
                setTopicSettings(topicName, { previewColumnFields: [] });
              }}
              // we need to pass this using sx to increase specificity, using p={0} won't work
              sx={{ padding: 0 }}
              variant="link"
            >
              Clear
            </Button>
          </Box>
          <Grid gap={4} my={6} templateColumns="1fr 2fr">
            <GridItem>
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
            </GridItem>
            <GridItem>
              <Label text="Preview">
                <TimestampDisplay format={previewTimestamps} unixEpochMillisecond={Date.now()} />
              </Label>
            </GridItem>
          </Grid>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button
            colorScheme="red"
            onClick={() => {
              setShowDialog(false);
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
