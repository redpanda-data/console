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

import { AlertIcon } from '@primer/octicons-react';
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import React, { type PropsWithChildren, useState } from 'react';

import type { TopicLogDirSummary } from '../../state/restInterfaces';
import { uiState } from '../../state/uiState';
import env, { IsDev } from '../../utils/env';
import { ZeroSizeWrapper } from '../../utils/tsxUtils';
import { prettyBytesOrNA } from '../../utils/utils';

export const Section = (p: PropsWithChildren<{ title: string }>) => (
  <section style={{ padding: '1em 2em' }}>
    <h2>{p.title}</h2>
    <div>{p.children}</div>
  </section>
);

export const WhiteCard = (p: PropsWithChildren<{ style?: React.CSSProperties; title?: string }>) => (
  <div
    style={{
      margin: '1em 2em',
      padding: '2em 2em',
      borderRadius: 4,
      background: 'white',
      boxShadow: '0em 0em 1em #0002',
      ...p.style,
    }}
  >
    {p.title && <h2 style={{ borderBottom: '1px solid #0002' }}>{p.title}</h2>}
    <div>{p.children}</div>
  </div>
);

function constant(constantValue: JSX.Element): () => JSX.Element {
  return () => constantValue;
}

export const Spacer = constant(<span style={{ display: 'flex', flexGrow: 1 }} />);

/**
 * returns an array with the numbers from start, up to end (does not include end!)
 */
export function range(start: number, end: number): number[] {
  const ar = [];
  for (let i = start; i < end; i++) ar.push(i);
  return ar;
}

/*
 * TODO:
 * Reloading the page does not ensure we'll get the update!
 * If there are multiple backend instances, we might get connected to an old instance again when we trigger a reload.
 */
export const UpdatePopup = observer(() => {
  const [isUpdateDialogOpen, setUpdateDialogOpen] = useState(true);
  if (IsDev) return null;

  const serverTimestamp = uiState.serverBuildTimestamp;
  if (serverTimestamp == null) return null;

  const curTimestamp = Number(env.REACT_APP_BUILD_TIMESTAMP);

  if (!curTimestamp || !Number.isFinite(curTimestamp)) return null;
  if (!serverTimestamp || !Number.isFinite(serverTimestamp)) return null;

  if (serverTimestamp < curTimestamp) return null; // don't downgrade
  if (serverTimestamp === curTimestamp) return null; // version already matches

  return (
    <Modal isOpen={isUpdateDialogOpen} onClose={() => setUpdateDialogOpen(false)}>
      <ModalOverlay />
      <ModalContent minW="xl">
        <ModalHeader>Redpanda Console has been updated</ModalHeader>
        <ModalBody>The page must be reloaded to apply the newest version of the frontend.</ModalBody>
        <ModalFooter gap={2}>
          <Button
            variant="outline"
            colorScheme="red"
            onClick={() => {
              setUpdateDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="solid"
            onClick={() => {
              setUpdateDialogOpen(false);
              window.location.reload();
            }}
          >
            Reload
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

export function renderLogDirSummary(summary: TopicLogDirSummary): JSX.Element {
  if (!summary.hint) return <>{prettyBytesOrNA(summary.totalSizeBytes)}</>;

  return (
    <>
      {prettyBytesOrNA(summary.totalSizeBytes)} <WarningToolip content={summary.hint} position="left" />
    </>
  );
}

export function WarningToolip(p: { content: React.ReactNode; position: 'top' | 'left' }): JSX.Element {
  const styleLeft = {
    bottom: '-2px',
    left: 'auto',
    right: '105%',
    transform: 'none',
  };

  return (
    <ZeroSizeWrapper>
      <div
        className="tooltip"
        style={{
          color: 'hsl(33deg, 90%, 65%)',
          borderRadius: '25px',
          display: 'inline-flex',
          placeItems: 'center',
          verticalAlign: 'middle',
          marginLeft: '30px',
          width: '22px',
          height: '22px',
        }}
      >
        <AlertIcon />
        <span className="tooltiptext" style={p.position === 'left' ? styleLeft : undefined}>
          {p.content}
        </span>
      </div>
    </ZeroSizeWrapper>
  );
}
