import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';

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
    <DialogContent size="xl">
      <DialogHeader>
        <DialogTitle>Add a connector</DialogTitle>
        <DialogDescription>Add a connector to your pipeline.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ConnectTiles
          className="px-0 pt-0"
          componentTypeFilter={connectorType ? [connectorType] : undefined}
          gridCols={3}
          hideHeader
          onChange={onAddConnector}
          variant="ghost"
        />
      </DialogBody>
    </DialogContent>
  </Dialog>
);
