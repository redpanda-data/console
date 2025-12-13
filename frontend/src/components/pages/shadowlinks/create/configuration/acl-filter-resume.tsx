/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Badge } from 'components/redpanda-ui/components/badge';
import { useFormContext, useWatch } from 'react-hook-form';

import {
  getOperationLabel,
  getPatternTypeLabel,
  getPermissionTypeLabel,
  getResourceTypeLabel,
} from '../../shadowlink-helpers';
import type { FormValues } from '../model';

// ACL Filter Resume Component - shows compact summary
export const ACLFilterResume = ({ index }: { index: number }) => {
  const { control } = useFormContext<FormValues>();

  const resourceType = useWatch({ control, name: `aclFilters.${index}.resourceType` });
  const resourcePattern = useWatch({ control, name: `aclFilters.${index}.resourcePattern` });
  const resourceName = useWatch({ control, name: `aclFilters.${index}.resourceName` });
  const principal = useWatch({ control, name: `aclFilters.${index}.principal` });
  const operation = useWatch({ control, name: `aclFilters.${index}.operation` });
  const permissionType = useWatch({ control, name: `aclFilters.${index}.permissionType` });
  const host = useWatch({ control, name: `aclFilters.${index}.host` });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="font-medium text-sm">ACL Filter {index + 1}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Resource type:</span>{' '}
          <Badge size="sm" variant="blue">
            {getResourceTypeLabel(resourceType)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Pattern:</span>{' '}
          <Badge size="sm" variant="blue">
            {getPatternTypeLabel(resourcePattern)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Resource name:</span>{' '}
          <Badge size="sm" variant="blue">
            {resourceName || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Principal:</span>{' '}
          <Badge size="sm" variant="blue">
            {principal || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Operation:</span>{' '}
          <Badge size="sm" variant="blue">
            {getOperationLabel(operation)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Permission:</span>{' '}
          <Badge size="sm" variant="blue">
            {getPermissionTypeLabel(permissionType)}
          </Badge>
        </div>
        <div className="md:col-span-3">
          <span className="text-muted-foreground">Host:</span>{' '}
          <Badge size="sm" variant="blue">
            {host || 'All'}
          </Badge>
        </div>
      </div>
    </div>
  );
};
