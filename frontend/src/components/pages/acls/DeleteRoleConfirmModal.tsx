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

import { ConfirmItemDeleteModal, Text } from '@redpanda-data/ui';
import type { FC } from 'react';

export const DeleteRoleConfirmModal: FC<{
  roleName: string;
  numberOfPrincipals: number;
  onConfirm: () => void;
  buttonEl: React.ReactElement;
}> = ({ roleName, numberOfPrincipals, onConfirm, buttonEl }) => {
  return (
    <ConfirmItemDeleteModal
      heading={`Delete role ${roleName}`}
      itemType="role"
      trigger={buttonEl}
      primaryActionLabel="Delete"
      secondaryActionLabel="Cancel"
      onConfirm={onConfirm}
      inputMatchText={roleName}
    >
      <Text>
        This role is assigned to {numberOfPrincipals} {numberOfPrincipals === 1 ? 'principal' : 'principals'}. Deleting
        it will remove it from these principals and take those permissions away. The ACLs will all be deleted.
      </Text>
      <Text>
        To restore the permissions, the role will need to be recreated and reassigned to these principals. To confirm,
        type the role name in the confirmation box below.
      </Text>
    </ConfirmItemDeleteModal>
  );
};
