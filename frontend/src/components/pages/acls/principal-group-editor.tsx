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

'use no memo';

import { Box, Button, Flex, FormField, Grid, Icon, Input, InputGroup, InputLeftAddon, Text } from '@redpanda-data/ui';
import { TrashIcon } from 'components/icons';

import type { ResourceACLs } from './models';
import { Operation } from './operation';
import { AclOperation, type AclStrResourceType } from '../../../state/rest-interfaces';
import { Label } from '../../../utils/tsx-utils';
import { SingleSelect } from '../../misc/select';

export const ResourceACLsEditor = (p: {
  resource: ResourceACLs;
  resourceType: AclStrResourceType;
  setIsFormValid: (isValid: boolean) => void;
  onDelete?: () => void;
  onChange: (resource: ResourceACLs) => void;
}) => {
  const res = p.resource;
  if (!res) {
    // Happens for clusterAcls?
    return null;
  }

  const isCluster = !('selector' in res);
  const isAllSet = res.all === 'Allow' || res.all === 'Deny';

  let resourceName = 'Cluster';
  if (p.resourceType === 'Topic') {
    resourceName = 'Topic';
  }
  if (p.resourceType === 'Group') {
    resourceName = 'Consumer Group';
  }
  if (p.resourceType === 'TransactionalID') {
    resourceName = 'Transactional ID';
  }

  const isInvalid =
    (!isCluster && res.patternType === 'Literal' && res.selector === '') ||
    (!isCluster && res.patternType === 'Prefixed' && res.selector === '');

  const errorText = 'Selector cannot be empty';
  p.setIsFormValid(!isInvalid);

  return (
    <Flex
      border="1px solid"
      borderColor="gray.300"
      borderRadius="md"
      boxShadow="0px 1px 2px 0px #0000000F"
      flexDirection="row"
      gap={5}
    >
      <Flex flexDirection="column" flexGrow={1} gap={10} p={6}>
        {isCluster ? (
          <Text fontWeight={600} whiteSpace="nowrap">
            Applies to whole cluster
          </Text>
        ) : (
          <FormField errorText={errorText} isInvalid={isInvalid} label={`Selector (${resourceName} Name)`}>
            <InputGroup data-testid={`${resourceName}-input-group`} zIndex={1}>
              <InputLeftAddon padding="0px" width="124px">
                <SingleSelect<'Any' | 'Literal' | 'Prefixed'>
                  chakraStyles={{
                    container: () => ({
                      flexGrow: 1,
                      marginLeft: '-1px',
                      marginRight: '-1px',
                      cursor: 'pointer',
                    }),
                  }}
                  isSearchable={false}
                  onChange={(e) => {
                    p.onChange({ ...res, patternType: e, selector: e === 'Any' ? '*' : '' } as ResourceACLs);
                  }}
                  options={[
                    { value: 'Any', label: 'Any' },
                    { value: 'Literal', label: 'Literal' },
                    { value: 'Prefixed', label: 'Prefixed' },
                  ]}
                  value={res.patternType as 'Any' | 'Literal' | 'Prefixed'}
                />
              </InputLeftAddon>
              <Input
                data-testid={`${resourceName}-selector`}
                isDisabled={res.patternType === 'Any'}
                onChange={(e) => {
                  p.onChange({ ...res, selector: e.target.value } as ResourceACLs);
                }}
                spellCheck={false}
                value={res.selector}
              />
            </InputGroup>
          </FormField>
        )}

        <Label style={{ width: '100%' }} text="Operations">
          <Grid gap={6} templateColumns="repeat(auto-fill, minmax(125px, 1fr))" width="full">
            <Operation
              onChange={(perm) => {
                p.onChange({ ...res, all: perm });
              }}
              operation={AclOperation.All}
              value={res.all}
            />

            {Object.entries(res.permissions)
              .sort(([op1], [op2]) => op1.localeCompare(op2))
              .map(([operation, permission]) => (
                <Operation
                  data-testid={`${resourceName}-${operation}`}
                  disabled={isAllSet}
                  key={operation}
                  onChange={(perm) => {
                    p.onChange({
                      ...res,
                      permissions: { ...(res.permissions as Record<string, unknown>), [operation]: perm },
                    } as ResourceACLs);
                  }}
                  operation={operation}
                  value={isAllSet ? res.all : permission}
                />
              ))}
          </Grid>
        </Label>
      </Flex>

      {Boolean(p.onDelete) && (
        <Flex>
          <Box alignSelf="center" bg="gray.300" height="80%" width="1px" />
          <Button alignSelf="center" mx={2} onClick={p.onDelete} variant="destructive-ghost">
            <Icon as={TrashIcon} fontSize="22px" />
          </Button>
        </Flex>
      )}
    </Flex>
  );
};
