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

import { X } from 'lucide-react';
import type { FC } from 'react';
import { useRef } from 'react';

import { Alert, AlertDescription, AlertTitle } from '../../../redpanda-ui/components/alert';
import { Button } from '../../../redpanda-ui/components/button';

export const AlertDeleteFailed: FC<{
  aclFailed: { err: unknown } | null;
  onClose: () => void;
}> = ({ aclFailed, onClose }) => {
  const ref = useRef(null);

  if (!aclFailed) {
    return null;
  }

  return (
    <Alert className="relative mb-4" ref={ref} variant="destructive">
      <AlertTitle>Failed to delete</AlertTitle>
      <AlertDescription>
        {(() => {
          if (aclFailed.err instanceof Error) {
            return aclFailed.err.message;
          }
          if (typeof aclFailed.err === 'string') {
            return aclFailed.err;
          }
          return 'Unknown error';
        })()}
      </AlertDescription>
      <Button className="absolute top-2 right-2" onClick={onClose} size="icon-sm" variant="ghost">
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
};
