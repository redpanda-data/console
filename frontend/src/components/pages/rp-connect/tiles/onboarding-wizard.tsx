import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogOverlay,
} from 'components/redpanda-ui/components/dialog';
import { ConnectTiles } from './connect-tiles';
import type { ConnectComponentType } from './types';

export const OnboardingWizard = ({
  isOpen,
  onOpenChange,
  onSubmit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (connectionName: string, connectionType: ConnectComponentType) => void;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogOverlay />
      <DialogContent size="full">
        <DialogBody>
          <ConnectTiles componentTypeFilter={['input', 'output']} onChange={onSubmit} variant="ghost" />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
