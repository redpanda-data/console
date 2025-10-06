import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogOverlay,
} from 'components/redpanda-ui/components/dialog';
import { Heading } from 'components/redpanda-ui/components/typography';

import { ConnectTiles } from './connect-tiles';
import type { ConnectComponentType } from '../types/schema';

export const AddConnectorDialog = ({
  isOpen,
  onCloseAddConnector,
  connectorType,
  onAddConnector,
}: {
  isOpen: boolean;
  onCloseAddConnector: () => void;
  connectorType?: ConnectComponentType;
  onAddConnector: ((connectionName: string, connectionType: ConnectComponentType) => void) | undefined;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onCloseAddConnector}>
      <DialogOverlay />
      <DialogContent size="xl">
        <DialogHeader>
          <Heading level={2}>Add a Connector</Heading>
        </DialogHeader>
        <DialogBody>
          <ConnectTiles
            componentTypeFilter={connectorType ? [connectorType] : undefined}
            hideHeader
            hideFilters
            onChange={onAddConnector}
            variant="ghost"
            className="px-0 pt-0"
            gridCols={3}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
