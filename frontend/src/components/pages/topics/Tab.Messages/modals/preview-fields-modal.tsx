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
      {/* `xl` is `sm:max-w-4xl`, matching the Chakra modal's `minW="4xl"`. */}
      <DialogContent size="xl">
        {/* Kept from the Chakra original: the PreviewSettings popover portals in here, inside the
            dialog's focus and scroll lock, rather than to the document body. */}
        {/* A flex column, so DialogBody keeps its `flex-1` and scrolls instead of overflowing the popup. */}
        <div className="flex min-h-0 flex-col" ref={setContainer}>
          <PortalContainerProvider value={container ?? undefined}>
            {/* Room for DialogContent's absolute close button. */}
            <DialogHeader className="pr-10">
              <DialogTitle>Preview fields</DialogTitle>
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
