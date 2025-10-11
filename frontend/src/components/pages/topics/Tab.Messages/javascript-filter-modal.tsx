import {
  Box,
  Button,
  Code,
  FormField,
  Grid,
  GridItem,
  Heading,
  Input,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  UnorderedList,
} from '@redpanda-data/ui';
import type { FC } from 'react';
import { useState } from 'react';

import FilterEditor from './editor';
import type { FilterEntry } from '../../../../state/ui';

const JavascriptFilterModal: FC<{
  currentFilter: FilterEntry;
  onClose: () => void;
  onSave: (filter: FilterEntry) => void;
}> = ({ currentFilter, onClose, onSave }) => {
  const [filter, setFilter] = useState<FilterEntry>({ ...currentFilter });

  return (
    <Modal isOpen onClose={onClose}>
      <ModalOverlay />
      <ModalContent minW="4xl">
        <ModalHeader>JavaScript filtering</ModalHeader>
        <ModalBody>
          <Text mb={4}>Write JavaScript code to filter your records.</Text>
          <Grid gap={6} templateColumns={{ base: '1fr', md: '3fr 2fr' }}>
            <GridItem>
              <FormField label="Filter display name">
                <Input
                  data-testid="add-javascript-filter-name"
                  onChange={(e) => {
                    setFilter({ ...filter, name: e.target.value });
                  }}
                  placeholder="This name will appear in the filter bar"
                  value={filter.name}
                />
              </FormField>
            </GridItem>
            <GridItem />
            <GridItem display="flex" flexDirection="column" gap={4}>
              <FormField label="Filter code">
                <Box borderRadius={20}>
                  <FilterEditor
                    data-testid="add-javascript-filter-code"
                    onValueChange={(code, transpiled) => {
                      setFilter({ ...filter, code, transpiledCode: transpiled });
                    }}
                    value={filter.code}
                  />
                </Box>
              </FormField>

              <UnorderedList>
                <ListItem>return true allows messages, return false discards them.</ListItem>
                <ListItem>
                  Available params are <Code>offset</Code>, <Code>partitionID</Code> (number), <Code>key</Code> (any),{' '}
                  <Code>value</Code> (any), and <Code>headers</Code> (object), <Code>keySchemaID</Code> (number) and{' '}
                  <Code>valueSchemaID</Code> (number)
                </ListItem>
                <ListItem>Multiple active filters are combined with 'and'.</ListItem>
              </UnorderedList>
            </GridItem>
            <GridItem>
              <Heading mb={6}>Examples</Heading>
              <UnorderedList margin={0} spacing={4} styleType="none">
                <ListItem>
                  <Code>value != null</Code> skips records without value
                </ListItem>
                <ListItem>
                  <Code>if (key == 'example') return true</Code>
                  only returns messages where keys equal <Code>'example'</Code> in their string presentation (after
                  decoding)
                </ListItem>
              </UnorderedList>
            </GridItem>
          </Grid>
        </ModalBody>
        <ModalFooter>
          <Box alignItems="center" display="flex" gap={2} justifyContent="flex-end">
            <Button data-testid="add-javascript-filter-close" onClick={() => onClose()} variant="outline">
              Close
            </Button>
            <Button
              data-testid="add-javascript-filter-save"
              onClick={() => {
                onSave(filter);
                onClose();
              }}
            >
              Save
            </Button>
          </Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default JavascriptFilterModal;
