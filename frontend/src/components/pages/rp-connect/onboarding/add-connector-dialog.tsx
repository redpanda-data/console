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
}) => (
  <Dialog onOpenChange={onCloseAddConnector} open={isOpen}>
    <DialogOverlay />
    <DialogContent size="xl">
      <DialogHeader>
        <Heading level={2}>Add a Connector</Heading>
      </DialogHeader>
      <DialogBody>
        <ConnectTiles
          className="px-0 pt-0"
          componentTypeFilter={connectorType ? [connectorType] : undefined}
          gridCols={3}
          hideFilters
          hideHeader
          onChange={onAddConnector}
          variant="ghost"
        />
      </DialogBody>
    </DialogContent>
  </Dialog>
);
