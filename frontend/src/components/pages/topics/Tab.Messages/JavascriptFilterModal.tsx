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
import { observer, useLocalObservable } from 'mobx-react';
import type { FC } from 'react';
import type { FilterEntry } from '../../../../state/ui';
import FilterEditor from './Editor';

const JavascriptFilterModal: FC<{
  currentFilter: FilterEntry;
  onClose: () => void;
  onSave: (filter: FilterEntry) => void;
}> = observer(({ currentFilter, onClose, onSave }) => {
  const state = useLocalObservable<{
    currentFilter: FilterEntry;
  }>(() => ({
    currentFilter: { ...currentFilter },
  }));

  return (
    <Modal isOpen onClose={onClose}>
      <ModalOverlay />
      <ModalContent minW="4xl">
        <ModalHeader>JavaScript filtering</ModalHeader>
        <ModalBody>
          <Text mb={4}>Write JavaScript code to filter your records.</Text>
          <Grid templateColumns={{ base: '1fr', md: '3fr 2fr' }} gap={6}>
            <GridItem>
              <FormField label="Filter display name">
                <Input
                  data-testid="add-javascript-filter-name"
                  value={state.currentFilter.name}
                  onChange={(e) => {
                    state.currentFilter.name = e.target.value;
                  }}
                  placeholder="This name will appear in the filter bar"
                />
              </FormField>
            </GridItem>
            <GridItem />
            <GridItem display="flex" gap={4} flexDirection="column">
              <FormField label="Filter code">
                <Box borderRadius={20}>
                  <FilterEditor
                    data-testid="add-javascript-filter-code"
                    value={state.currentFilter.code}
                    onValueChange={(code, transpiled) => {
                      state.currentFilter.code = code;
                      state.currentFilter.transpiledCode = transpiled;
                    }}
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
              <UnorderedList styleType="none" margin={0} spacing={4}>
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
          <Box display="flex" gap={2} alignItems="center" justifyContent="flex-end">
            <Button data-testid="add-javascript-filter-close" onClick={() => onClose()} variant="outline">
              Close
            </Button>
            <Button
              data-testid="add-javascript-filter-save"
              onClick={() => {
                onSave(state.currentFilter);
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
});

export default JavascriptFilterModal;
