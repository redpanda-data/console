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

import { Alert } from 'components/redpanda-ui/components/alert';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import './pipeline-editor.css';

/**
 * Warning banner for a pipeline config that can't be shown as-is, shared by the visual canvas and the
 * sidebar outline. `variant` owns the notice's padding, type size and elevation; callers pass only
 * positioning via `className`.
 */
export function InvalidConfigNotice({
  children,
  className,
  variant,
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'floating' | 'compact' | null;
}) {
  return (
    <div className={className}>
      <Alert
        className="pipeline-invalid-notice"
        data-notice-variant={variant}
        icon={<TriangleAlert />}
        variant="warning"
      >
        <span className="col-start-2">{children}</span>
      </Alert>
    </div>
  );
}
