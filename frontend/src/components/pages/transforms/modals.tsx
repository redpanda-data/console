import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import { type JSX, useState } from 'react';

import { openModal } from '../../../utils/modal-container';

const ExplicitConfirmModal = (p: {
  title: JSX.Element;
  body: JSX.Element;
  primaryButtonContent: JSX.Element;
  secondaryButtonContent: JSX.Element;

  onPrimaryButton: (closeModal: () => void) => void;
  onSecondaryButton: (closeModal: () => void) => void;

  closeModal: () => void;

  requiredText?: string;
}) => {
  const [confirmBoxText, setConfirmBoxText] = useState('');

  const requiredText = p.requiredText ?? 'delete';
  const isConfirmEnabled = confirmBoxText === requiredText;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          p.closeModal();
        }
      }}
      open
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{p.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {p.body}

          <div className="mt-4">
            To confirm, enter "{requiredText}":
            <Input onChange={(e) => setConfirmBoxText(e.target.value)} value={confirmBoxText} />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => p.onSecondaryButton(p.closeModal)} variant="ghost">
            {p.secondaryButtonContent}
          </Button>
          <Button disabled={!isConfirmEnabled} onClick={() => p.onPrimaryButton(p.closeModal)} variant="destructive">
            {p.primaryButtonContent}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export function openDeleteModal(transformName: string, onConfirm: () => void) {
  openModal(ExplicitConfirmModal, {
    title: <>Permanently delete transform {transformName}</>,
    body: <>Deleting a transform cannot be undone.</>,
    primaryButtonContent: <>Delete</>,
    secondaryButtonContent: <>Cancel</>,

    onPrimaryButton: (closeModal) => {
      onConfirm();
      closeModal();
    },

    onSecondaryButton: (closeModal) => {
      closeModal();
    },
  });
}
