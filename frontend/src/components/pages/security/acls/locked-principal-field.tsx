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

import { CardField } from 'components/redpanda-ui/components/card';
import { FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';

import type { PrincipalFieldProps } from '../shared/acl-model';
import { parsePrincipal } from '../shared/acl-model';

/**
 * A read-only principal field used when the principal is pre-set and should not be editable.
 * Shared across ACL create, role create, and role update pages.
 */
function LockedPrincipalField({ value, error, label = 'Principal' }: PrincipalFieldProps & { label?: string }) {
  return (
    <CardField>
      <FieldLabel htmlFor="principal">{label}</FieldLabel>
      <Input disabled id="principal" testId="shared-principal-input" value={parsePrincipal(value).name} />
      {error && <FieldError>{error}</FieldError>}
    </CardField>
  );
}

export { LockedPrincipalField };
