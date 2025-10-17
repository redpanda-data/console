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
import { observer } from 'mobx-react';
import type { FC } from 'react';

import type { ColumnList, TimestampDisplayFormat } from '../../../../../state/ui';
import { uiState } from '../../../../../state/ui-state';
import { Label, TimestampDisplay } from '../../../../../utils/tsx-utils';
import { SingleSelect } from '../../../../misc/select';

export const ColumnSettings: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
}> = observer(({ getShowDialog, setShowDialog }) => {
  const columnSettings: ColumnList[] = [
    { title: 'Offset', dataIndex: 'offset' },
    { title: 'Partition', dataIndex: 'partitionID' },
    { title: 'Timestamp', dataIndex: 'timestamp' },
    { title: 'Key', dataIndex: 'key' },
    { title: 'Value', dataIndex: 'value' },
    { title: 'Key Size', dataIndex: 'keySize' },
    { title: 'Value Size', dataIndex: 'valueSize' },
  ];

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
                {columnSettings.map(({ title, dataIndex }) => (
                  <Checkbox
                    isChecked={!!uiState.topicSettings.previewColumnFields.find((x) => x.dataIndex === dataIndex)}
                    key={dataIndex}
                    onChange={({ target: { checked } }) => {
                      if (checked) {
                        uiState.topicSettings.previewColumnFields.pushDistinct({
                          title,
                          dataIndex,
                        });
                      } else {
                        const idxToRemove = uiState.topicSettings.previewColumnFields.findIndex(
                          (x) => x.dataIndex === dataIndex
                        );
                        uiState.topicSettings.previewColumnFields.splice(idxToRemove, 1);
                      }
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
                uiState.topicSettings.previewColumnFields = [];
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
                  onChange={(e) => (uiState.topicSettings.previewTimestamps = e)}
                  options={[
                    { label: 'Local DateTime', value: 'default' },
                    { label: 'Unix DateTime', value: 'unixTimestamp' },
                    { label: 'Relative', value: 'relative' },
                    { label: 'Local Date', value: 'onlyDate' },
                    { label: 'Local Time', value: 'onlyTime' },
                    { label: 'Unix Millis', value: 'unixMillis' },
                  ]}
                  value={uiState.topicSettings.previewTimestamps}
                />
              </Label>
            </GridItem>
            <GridItem>
              <Label text="Preview">
                <TimestampDisplay format={uiState.topicSettings.previewTimestamps} unixEpochMillisecond={Date.now()} />
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
});
