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

export const getCreateUserButtonProps = (
  isAdminApiConfigured: boolean,
  featureCreateUser: boolean,
  canManageUsers: boolean | undefined
) => {
  const hasRBAC = canManageUsers !== undefined;

  return {
    disabled: !(isAdminApiConfigured && featureCreateUser) || (hasRBAC && canManageUsers === false),
    tooltip: [
      !isAdminApiConfigured && 'The Redpanda Admin API is not configured.',
      !featureCreateUser && "Your cluster doesn't support this feature.",
      hasRBAC && canManageUsers === false && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.',
    ]
      .filter(Boolean)
      .join(' '),
  };
};
