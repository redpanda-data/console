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

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';

import { type BoxedAction, useShadowBoxGuard } from './use-shadow-box-guard';

/**
 * For a form whose submit the box would reject: says why up front, while its submit button is
 * disabled with the same reason. Renders nothing while the cluster isn't boxed.
 */
export const ShadowBoxedAlert = ({ action, testId }: { action: BoxedAction; testId?: string }) => {
  const reason = useShadowBoxGuard().reasonFor(action);
  if (!reason) {
    return null;
  }
  return (
    <Alert icon={<TriangleAlertIcon />} testId={testId ?? 'shadow-boxed-alert'} variant="warning">
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  );
};
