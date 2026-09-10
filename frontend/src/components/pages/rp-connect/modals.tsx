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

export const ExplicitConfirmModal = (p: {
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
      {/* `lg` is `sm:max-w-2xl`, matching the Chakra modal's `size="2xl"`. */}
      <DialogContent size="lg">
        {/* Room for DialogContent's absolute close button. */}
        <DialogHeader className="pr-10">
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

export function openDeleteModal(pipelineId: string, onConfirm: () => void) {
  openModal(ExplicitConfirmModal, {
    title: <>Permanently delete pipeline {pipelineId}</>,
    body: <>Deleting a pipeline cannot be undone.</>,
    primaryButtonContent: <>Delete</>,
    secondaryButtonContent: <>Cancel</>,

    requiredText: pipelineId.trim(),

    onPrimaryButton: (closeModal) => {
      onConfirm();
      closeModal();
    },

    onSecondaryButton: (closeModal) => {
      closeModal();
    },
  });
}
