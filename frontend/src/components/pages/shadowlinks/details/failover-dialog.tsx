/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';

type FailoverDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicName?: string;
  onConfirm: () => void;
  isLoading?: boolean;
};

export const FailoverDialog = ({ open, onOpenChange, topicName, onConfirm, isLoading }: FailoverDialogProps) => {
  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Failover</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <div className="text-body">
              {topicName
                ? `This action will promote the shadow topic "${topicName}" to an active state, allowing writes to this cluster.`
                : 'This action will promote all shadow topics to an active state, allowing writes to this cluster.'}
            </div>
            <div>
              <div className="font-semibold text-body">Before proceeding, ensure:</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <div className="text-body">
                    All applications and clients have been updated to point to this cluster
                  </div>
                </li>
                <li>
                  <div className="text-body">Any Redpanda Connect pipelines have been re-created on this cluster</div>
                </li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isLoading} onClick={onConfirm}>
            {isLoading ? 'Failing over...' : 'Confirm Failover'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
