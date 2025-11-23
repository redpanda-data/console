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
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface FooterProps {
  mode: 'create' | 'edit';
  onSave: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
}

export const Footer = memo(({ mode, onSave, onCancel, isSaving }: FooterProps) => {
  const navigate = useNavigate();

  const handleCancel = useCallback(() => {
    onCancel?.();
    navigate(-1);
  }, [navigate, onCancel]);

  return (
    <div className="flex items-center justify-end gap-2 border-t pt-4">
      <Button disabled={isSaving} onClick={handleCancel} variant="outline">
        Cancel
      </Button>
      <Button disabled={isSaving} onClick={onSave}>
        {mode === 'create' ? 'Create Pipeline' : 'Update Pipeline'}
      </Button>
    </div>
  );
});

Footer.displayName = 'Footer';
