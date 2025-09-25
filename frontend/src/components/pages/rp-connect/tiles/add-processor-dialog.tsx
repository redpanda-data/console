import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogOverlay,
} from 'components/redpanda-ui/components/dialog';
import { Heading } from 'components/redpanda-ui/components/typography';
import { ConnectTiles } from './connect-tiles';
import type { ConnectComponentType } from './types';

export const AddProcessorDialog = ({
  isOpen,
  onCloseAddProcessor,
  processorType,
  onAddProcessor,
}: {
  isOpen: boolean;
  onCloseAddProcessor: () => void;
  processorType?: ConnectComponentType;
  onAddProcessor: ((connectionName: string, connectionType: ConnectComponentType) => void) | undefined;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onCloseAddProcessor}>
      <DialogOverlay />
      <DialogContent size="full">
        <DialogHeader>
          <Heading level={2}>Add a Processor</Heading>
        </DialogHeader>
        <DialogBody>
          <ConnectTiles
            componentTypeFilter={processorType ? [processorType] : undefined}
            hideHeader
            hideFilters
            onChange={onAddProcessor}
            variant="ghost"
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
