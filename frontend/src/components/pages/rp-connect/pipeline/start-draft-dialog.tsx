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

import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Play } from 'lucide-react';
import { useMemo } from 'react';

import { START_DRAFT_CONFIRM_IRREVERSIBLE, START_DRAFT_CONFIRM_TITLE, startDraftConfirmBody } from './draft-copy';
import { extractAllTopics } from '../utils/yaml';

/**
 * Starting a draft deploys it for real and it is never a draft again, so it confirms first —
 * naming the topics it will touch and the compute it will use.
 */
export function StartDraftDialog({
  open,
  configYaml,
  computeUnits,
  isStarting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  configYaml: string;
  computeUnits: number;
  isStarting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  // Parsed only while open: a list page holds one of these per draft row.
  const topics = useMemo(() => (open ? extractAllTopics(configYaml) : []), [open, configYaml]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{START_DRAFT_CONFIRM_TITLE}</DialogTitle>
        </DialogHeader>
        <DialogBody spacing="sm">
          <p>{startDraftConfirmBody({ topics, computeUnits })}</p>
          <p>{START_DRAFT_CONFIRM_IRREVERSIBLE}</p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={isStarting}
            icon={isStarting ? <Spinner /> : <Play />}
            onClick={onConfirm}
            testId="confirm-start-draft"
          >
            Start pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
