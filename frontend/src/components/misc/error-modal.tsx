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

import { ErrorIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import React, { Component, useEffect, useReducer } from 'react';

class ErrorModal extends Component<ErrorModalProps> {
  title: string;
  subTitle: React.ReactNode;
  content: React.ReactNode;

  constructor(p: ErrorModalProps) {
    super(p);
    this.title = this.props.title();
    this.subTitle = this.props.subTitle();
    this.content = this.props.content();
  }

  render() {
    const p = this.props;

    return (
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            p.onClose();
          }
        }}
        onOpenChangeComplete={(open) => {
          if (!open) {
            p.afterClose();
          }
        }}
        open={p.isVisible}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{this.title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-8">
              <div className="flex flex-row gap-2 pr-6">
                <ErrorIcon className="size-6 shrink-0 self-center text-destructive" />
                <div className="self-center">{this.subTitle}</div>
              </div>

              {this.content ? <div className="max-h-[300px] self-stretch overflow-y-auto">{this.content}</div> : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={p.onClose}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}

type ErrorModalProps = {
  key: number;

  title: () => string;
  subTitle: () => React.ReactNode;
  content: () => React.ReactNode;

  isVisible: boolean;
  onClose: () => void;
  afterClose: () => void;

  animate: boolean;
};

const errorModals: ErrorModalProps[] = [];
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const sub of subscribers) sub();
}

let nextErrorKey = 0;
export function showErrorModal(title: string, subTitle: React.ReactNode, content: React.ReactNode) {
  const key = nextErrorKey;
  nextErrorKey += 1;

  // keep formatting for strings
  let formattedContent = content;
  if (typeof content === 'string') {
    formattedContent = (
      <div
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.6,
          fontFamily: 'monospace',
          fontSize: 'small',
        }}
      >
        {content}
      </div>
    );
  }

  errorModals.push({
    key,

    title: () => title,
    subTitle: () => subTitle,
    content: () => formattedContent,

    isVisible: true,
    onClose: () => onClose(key),
    afterClose: () => afterClose(key),

    animate: true,
  });
  notifySubscribers();
}

const onClose = (key: number) => {
  const current = errorModals[0];
  const next = errorModals.length > 1 ? errorModals[1] : undefined;

  if (next) {
    // Switch to next — don't animate current or next modal
    current.animate = false;
    next.animate = false;
    afterClose(key); // immediately switch to next
  } else {
    // last modal
    current.animate = true;
    current.isVisible = false;
  }
  notifySubscribers();
};

const afterClose = (key: number) => {
  const idx = errorModals.findIndex((x) => x.key === key);
  if (idx > -1) errorModals.splice(idx, 1);
  notifySubscribers();
};

export function ErrorModalsRenderer() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    subscribers.add(forceUpdate);
    return () => {
      subscribers.delete(forceUpdate);
    };
  }, []);

  if (errorModals.length === 0) {
    return null;
  }
  const e = errorModals[0];
  return <ErrorModal {...e} />;
}

export function renderErrorModals() {
  return <ErrorModalsRenderer />;
}
