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

import type { AclDetail } from '../shared/acl-model';
import { AclsCard } from '../shared/acls-card';

type UserAclsCardProps = {
  acls?: AclDetail[];
  userName?: string;
  isLoading?: boolean;
};

export const UserAclsCard = ({ acls, userName, isLoading }: UserAclsCardProps) => (
  <AclsCard acls={acls} isLoading={isLoading} principal={userName ? `User:${userName}` : undefined} />
);
