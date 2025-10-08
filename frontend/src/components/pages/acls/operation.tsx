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

import { CheckIcon, CloseIcon, MinusIcon } from '@chakra-ui/icons';
import { Flex } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import type { CSSProperties, FC, ReactElement, ReactNode } from 'react';

import { AclOperation, type AclOperationType, type AclStrPermission } from '../../../state/rest-interfaces';
import { Label } from '../../../utils/tsx-utils';
import { SingleSelect } from '../../misc/select';

const icons = {
  minus: <MinusIcon color="grey" />,
  check: <CheckIcon color="green" />,
  cross: <CloseIcon color="red" />,
};

const OptionContent: FC<{
  children: ReactNode;
  icon: ReactElement;
}> = ({ children, icon }) => (
  <Flex alignItems="center" gap={2} pointerEvents="none">
    {icon}
    <span>{children}</span>
  </Flex>
);

export const Operation = observer(
  (p: {
    operation: string | AclOperationType;
    value: AclStrPermission;
    disabled?: boolean;
    onChange: (v: AclStrPermission) => void;
    style?: CSSProperties;
  }) => {
    const disabled = p.disabled ?? false;

    const operationName =
      typeof p.operation === 'string'
        ? p.operation
        : Object.keys(AclOperation).find((key) => AclOperation[key as keyof typeof AclOperation] === p.operation) ||
          'Unknown';

    return (
      <Label text={operationName}>
        <SingleSelect<AclStrPermission>
          components={{
            DropdownIndicator: null,
          }}
          isDisabled={disabled}
          onChange={p.onChange}
          options={[
            {
              value: 'Any',
              label: <OptionContent icon={icons.minus}>Not set</OptionContent>,
            },
            {
              value: 'Allow',
              label: <OptionContent icon={icons.check}>Allow</OptionContent>,
            },
            {
              value: 'Deny',
              label: <OptionContent icon={icons.cross}>Deny</OptionContent>,
            },
          ]}
          value={p.value}
        />
      </Label>
    );
  }
);
