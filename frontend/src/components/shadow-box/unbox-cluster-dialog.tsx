/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { TriangleAlertIcon } from 'lucide-react';
import {
  describeShadowBoxError,
  isStaleRevisionError,
  useShadowBoxStatusQuery,
  useUnboxClusterMutation,
} from 'react-query/api/shadow-box';
import { toast } from 'sonner';

import { BoxChangedNotice } from './box-changed-notice';
import { BOX_PHASE_LABEL, isBlockingPhase } from './shadow-box-model';
import { useOpenedBox } from './use-opened-box';

type UnboxClusterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in the title; standalone Console doesn't know the cluster's name. */
  clusterName?: string;
};

/** The body mounts with the dialog's content, so it pins the box as it was when the dialog opened. */
export const UnboxClusterDialog = ({ open, onOpenChange, clusterName }: UnboxClusterDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent testId="unbox-cluster-dialog">
      <UnboxClusterBody label={clusterName ?? 'this cluster'} onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const UnboxClusterBody = ({ label, onClose }: { label: string; onClose: () => void }) => {
  const { summary } = useShadowBoxStatusQuery();
  const unbox = useUnboxClusterMutation();
  const { opened, changed, refresh } = useOpenedBox(summary, unbox.isPending || unbox.isSuccess);
  const alreadyReleased = !(changed || isBlockingPhase(opened.phase));

  const handleRefresh = () => {
    refresh();
    unbox.reset();
  };

  const handleUnbox = () => {
    unbox.mutate(
      { expectedRevision: opened.revision },
      {
        onSuccess: () => {
          toast.success(`Unboxing ${label}`, {
            description: 'Brokers stop enforcing the box as they confirm. Writes resume once every broker has.',
          });
          onClose();
        },
      }
    );
  };

  return (
    <>
      <DialogHeader align="left">
        <DialogTitle>Unbox {label}?</DialogTitle>
        <DialogDescription>
          Clients can produce, consume and change this cluster again once every broker confirms.
        </DialogDescription>
      </DialogHeader>
      <DialogBody spacing="md">
        {changed ? <BoxChangedNotice onRefresh={handleRefresh} refreshLabel="Review the current box" /> : null}
        {alreadyReleased ? (
          <Alert testId="unbox-cluster-already-released" variant="informative">
            <AlertTitle>This cluster is already {BOX_PHASE_LABEL[opened.phase].toLowerCase()}</AlertTitle>
            <AlertDescription>
              <p>There’s no box to release. Close this dialog to see its status.</p>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert icon={<TriangleAlertIcon />} variant="warning">
            <AlertTitle>Unbox only if clients won’t write here by mistake</AlertTitle>
            <AlertDescription>
              <p>
                If a shadow link has already failed over from this cluster, clients still pointed at it start writing
                here again, and the shadow cluster never sees those writes. Repoint clients first, or unbox only to
                cancel a cutover.
              </p>
            </AlertDescription>
          </Alert>
        )}
        {unbox.error && !(changed && isStaleRevisionError(unbox.error)) ? (
          <Alert testId="unbox-cluster-error" variant="destructive">
            <AlertTitle>Couldn’t unbox the cluster</AlertTitle>
            <AlertDescription>
              <p>{describeShadowBoxError(unbox.error)}</p>
            </AlertDescription>
          </Alert>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button
          disabled={changed || alreadyReleased}
          isLoading={unbox.isPending}
          onClick={handleUnbox}
          testId="confirm-unbox-cluster"
        >
          Unbox cluster
        </Button>
      </DialogFooter>
    </>
  );
};
