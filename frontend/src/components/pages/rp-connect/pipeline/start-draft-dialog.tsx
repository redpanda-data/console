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
import { useMemo, useState } from 'react';

import { START_DRAFT_CONFIRM_IRREVERSIBLE, START_DRAFT_CONFIRM_TITLE, startDraftConfirmBody } from './draft-copy';
import { useStartDraft } from './use-start-draft';
import { extractAllTopics } from '../utils/yaml';

function StartDraftDialog({
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
          <p>{startDraftConfirmBody(topics, computeUnits)}</p>
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

/**
 * The only way to start a draft: `confirmDialog` must be rendered for `requestStart` to reach the
 * start. Rendered outside the trigger's own tree — a dropdown item's menu closes over it.
 */
export function useStartDraftConfirm({
  id,
  configYaml,
  computeUnits,
}: {
  id: string;
  configYaml: string;
  computeUnits: number;
}) {
  const { startDraft, isStartingDraft } = useStartDraft();
  const [isOpen, setIsOpen] = useState(false);

  return {
    requestStart: () => setIsOpen(true),
    isStartingDraft,
    confirmDialog: (
      <StartDraftDialog
        computeUnits={computeUnits}
        configYaml={configYaml}
        isStarting={isStartingDraft}
        onConfirm={async () => {
          await startDraft(id);
          setIsOpen(false);
        }}
        onOpenChange={setIsOpen}
        open={isOpen}
      />
    ),
  };
}
