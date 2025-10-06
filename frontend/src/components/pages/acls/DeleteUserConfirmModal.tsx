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

export const DeleteUserConfirmModal: FC<{
  userName: string;
  onConfirm: () => void;
  buttonEl: React.ReactElement;
}> = ({ userName, onConfirm, buttonEl }) => {
  return (
    <ConfirmItemDeleteModal
      heading={`Delete user ${userName}`}
      inputMatchText={userName}
      itemType="user"
      onConfirm={onConfirm}
      primaryActionLabel="Delete"
      secondaryActionLabel="Cancel"
      trigger={buttonEl}
    >
      <Text>
        This user has roles and ACLs assigned to it. Those roles and ACLs will not be deleted, but the user will need to
        be recreated and reassigned to them to be used again. To confirm, type the user name in the box below.
      </Text>
    </ConfirmItemDeleteModal>
  );
};
