/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { AlertIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import React, { type JSX, useState } from 'react';

import type { TopicLogDirSummary } from '../../state/rest-interfaces';
import { uiState } from '../../state/ui-state';
import { env, IsDev } from '../../utils/env';
import { isNonzeroNumber } from '../../utils/number-utils';
import { isNonEmptyString } from '../../utils/string-utils';
import { ZeroSizeWrapper } from '../../utils/tsx-utils';
import { prettyBytesOrNA } from '../../utils/utils';

function constant(constantValue: JSX.Element): () => JSX.Element {
  return () => constantValue;
}

export const Spacer = constant(<span className="flex grow" />);

/**
 * returns an array with the numbers from start, up to end (does not include end!)
 */
export function range(start: number, end: number): number[] {
  const ar: number[] = [];
  for (let i = start; i < end; i++) {
    ar.push(i);
  }
  return ar;
}

/*
 * TODO:
 * Reloading the page does not ensure we'll get the update!
 * If there are multiple backend instances, we might get connected to an old instance again when we trigger a reload.
 */
export const UpdatePopup = () => {
  const [isUpdateDialogOpen, setUpdateDialogOpen] = useState(true);
  if (IsDev) {
    return null;
  }

  const serverTimestamp = uiState.serverBuildTimestamp;
  if (serverTimestamp === null) {
    return null;
  }

  const curTimestamp = Number(env.REACT_APP_BUILD_TIMESTAMP);

  if (!isNewerBuild(curTimestamp, serverTimestamp)) {
    return null;
  }

  return (
    <Dialog onOpenChange={setUpdateDialogOpen} open={isUpdateDialogOpen}>
      {/* Nearest rung above the old 36rem minimum. */}
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Redpanda Console has been updated</DialogTitle>
        </DialogHeader>
        <DialogBody>The page must be reloaded to apply the newest version of the frontend.</DialogBody>
        <DialogFooter>
          <Button
            onClick={() => {
              setUpdateDialogOpen(false);
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setUpdateDialogOpen(false);
              window.location.reload();
            }}
            variant="primary"
          >
            Reload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export function renderLogDirSummary(summary: TopicLogDirSummary): JSX.Element {
  if (!isNonEmptyString(summary.hint)) {
    return <>{prettyBytesOrNA(summary.totalSizeBytes)}</>;
  }

  return (
    <>
      {prettyBytesOrNA(summary.totalSizeBytes)} <WarningToolip content={summary.hint} position="left" />
    </>
  );
}

export function WarningToolip(p: { content: React.ReactNode; position: 'top' | 'left' }): JSX.Element {
  return (
    <ZeroSizeWrapper>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Warning"
              className="ms-[30px] inline-flex size-[22px] items-center align-middle"
              variant="unstyled"
            />
          }
        >
          <span className="rounded-full text-warning">
            <AlertIcon />
          </span>
        </TooltipTrigger>
        <TooltipContent side={p.position}>{p.content}</TooltipContent>
      </Tooltip>
    </ZeroSizeWrapper>
  );
}

function isNewerBuild(current: number, server: number | undefined): boolean {
  return (
    isNonzeroNumber(current) &&
    Number.isFinite(current) &&
    isNonzeroNumber(server) &&
    Number.isFinite(server) &&
    server > current
  );
}
