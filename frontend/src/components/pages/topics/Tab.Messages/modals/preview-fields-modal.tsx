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

import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { PortalContainerProvider } from 'components/redpanda-ui/lib/use-portal-container';
import { type FC, useState } from 'react';

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { PreviewSettings } from '../preview-settings';

/**
 * The settings popover must portal inside the focus lock. Keep the content column scrollable and clear of the dialog's close control.
 */
export const PreviewFieldsModal: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
  messages: TopicMessage[];
  topicName: string;
}> = ({ getShowDialog, setShowDialog, messages, topicName }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setShowDialog(false);
        }
      }}
      open={getShowDialog()}
    >
      <DialogContent size="xl">
        <div className="flex min-h-0 flex-col" ref={setContainer}>
          <PortalContainerProvider value={container ?? undefined}>
            <DialogHeader>
              <div className="pr-6">
                <DialogTitle>Preview fields</DialogTitle>
              </div>
            </DialogHeader>
            <DialogBody>
              <PreviewSettings messages={messages} topicName={topicName} />
            </DialogBody>
            <DialogFooter>
              <Button
                onClick={() => {
                  setShowDialog(false);
                }}
                variant="destructive"
              >
                Close
              </Button>
            </DialogFooter>
          </PortalContainerProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
};
