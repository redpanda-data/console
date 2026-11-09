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
  isStaleRevisionError,
  useClusterFenceStatusQuery,
  useUnfenceClusterMutation,
} from 'react-query/api/cluster-fence';
import { toast } from 'sonner';

import { FENCE_PHASE_LABEL, isBlockingPhase } from './cluster-fence-model';
import { FenceChangedNotice, FenceWriteErrorAlert, useOpenedFence } from './fence-dialog-parts';

/** The body mounts with the dialog's content, so it pins the fence as it was when the dialog opened. */
export const UnfenceClusterDialog = ({
  open,
  onOpenChange,
  clusterName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Standalone Console doesn't know the cluster's name. */
  clusterName?: string;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent testId="unfence-cluster-dialog">
      <UnfenceClusterBody label={clusterName ?? 'this cluster'} onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const UnfenceClusterBody = ({ label, onClose }: { label: string; onClose: () => void }) => {
  const { summary } = useClusterFenceStatusQuery();
  const unfence = useUnfenceClusterMutation();
  const { opened, changed, refresh } = useOpenedFence(summary, unfence.isPending || unfence.isSuccess);
  const alreadyReleased = !(changed || isBlockingPhase(opened.phase));

  const handleRefresh = () => {
    refresh();
    unfence.reset();
  };

  const handleUnfence = () => {
    unfence.mutate(
      { expectedRevision: opened.revision },
      {
        onSuccess: () => {
          toast.success(`Unfencing ${label}`, {
            description: 'Each broker accepts writes again as soon as it picks up Unfence. The settings stay saved.',
          });
          onClose();
        },
      }
    );
  };

  return (
    <>
      <DialogHeader align="left">
        <DialogTitle>Unfence {label}?</DialogTitle>
        <DialogDescription>
          Each broker accepts writes again as soon as it picks up Unfence, and the cluster is unfenced once every broker
          has. The settings stay saved for the next Fence.
        </DialogDescription>
      </DialogHeader>
      <DialogBody spacing="md">
        {changed ? <FenceChangedNotice onRefresh={handleRefresh} refreshLabel="Review the current fence" /> : null}
        {alreadyReleased ? (
          <Alert testId="unfence-cluster-already-released" variant="informative">
            <AlertTitle>This cluster is already {FENCE_PHASE_LABEL[opened.phase].toLowerCase()}</AlertTitle>
            <AlertDescription>
              <p>There’s no fence to release. Close this dialog to see its status.</p>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert icon={<TriangleAlertIcon />} variant="warning">
            <AlertTitle>Unfence only if clients won’t write here by mistake</AlertTitle>
            <AlertDescription>
              <p>
                If a shadow link has already failed over from this cluster, clients still pointed at it start writing
                here again, and the shadow cluster never sees those writes. Repoint clients first, or unfence only to
                cancel a failover.
              </p>
            </AlertDescription>
          </Alert>
        )}
        {unfence.error && !(changed && isStaleRevisionError(unfence.error)) ? (
          <FenceWriteErrorAlert
            error={unfence.error}
            testId="unfence-cluster-error"
            title="Couldn’t unfence the cluster"
          />
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button
          disabled={changed || alreadyReleased}
          isLoading={unfence.isPending}
          onClick={handleUnfence}
          testId="confirm-unfence-cluster"
        >
          Unfence cluster
        </Button>
      </DialogFooter>
    </>
  );
};
