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

import {
  Box,
  Button,
  Flex,
  FormField,
  Grid,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftAddon,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useToast,
  VStack,
} from '@redpanda-data/ui';
import { TrashIcon } from 'components/icons';
import { comparer } from 'mobx';
import { observer } from 'mobx-react';
import { useState } from 'react';

import {
  type AclPrincipalGroup,
  createEmptyClusterAcl,
  createEmptyConsumerGroupAcl,
  createEmptyTopicAcl,
  createEmptyTransactionalIdAcl,
  type PrincipalType,
  type ResourceACLs,
  unpackPrincipalGroup,
} from './models';
import { Operation } from './operation';
import { api } from '../../../state/backend-api';
import { AclOperation, type AclStrOperation, type AclStrResourceType } from '../../../state/rest-interfaces';
import { AnimatePresence, animProps_radioOptionGroup, MotionDiv } from '../../../utils/animation-props';
import { Code, Label, LabelTooltip } from '../../../utils/tsx-utils';
import { SingleSelect } from '../../misc/select';

export const AclPrincipalGroupEditor = observer(
  (p: { principalGroup: AclPrincipalGroup; type: 'create' | 'edit'; onClose: () => void }) => {
    const group = p.principalGroup;
    const toast = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(undefined as string | undefined);

    const [isFormValid, setIsFormValid] = useState(true);
    const [isTopicsValid, setTopicsIsValid] = useState(true);
    const [isConsumerGroupsValid, setConsumerGroupsIsValid] = useState(true);
    const [isTransactionalIDValid, setTransactionalIDIsValid] = useState(true);

    const noNameOrNameInUse =
      p.type === 'create' &&
      (!group.principalName ||
        api.ACLs?.aclResources.any((r) => r.acls.any((a) => a.principal === `User:${group.principalName}`)));

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
    const onOK = async () => {
      setError(undefined);
      setIsLoading(true);
      try {
        if (group.principalName.length === 0) {
          throw new Error('The principal field can not be empty.');
        }

        const allToCreate = unpackPrincipalGroup(group);

        if (allToCreate.length === 0) {
          if (p.type === 'create') {
            throw new Error(
              'Creating an ACL group requires at least one resource to be targeted. Topic/Group targets with an empty selector are not valid.'
            );
          }
          throw new Error('No targeted resources. You can delete this ACL group from the list view.');
        }

        // Ignore creation of ACLs that already exist, and delete ACLs that are no longer needed
        if (p.type === 'edit' && group.sourceEntries.length > 0) {
          const requests = group.sourceEntries.map((acl) => {
            // try to find this in allToCreate
            const foundIdx = allToCreate.findIndex((x) => comparer.structural(acl, x));
            if (foundIdx !== -1) {
              // acl already exists, remove it from the list
              allToCreate.splice(foundIdx, 1);
              return Promise.resolve();
            }
            // acl should no longer exist, delete it
            return api.deleteACLs(acl);
          });
          await Promise.allSettled(requests);
        }

        // Create all ACLs in group
        const requests = allToCreate.map((x) =>
          api.createACL({
            host: x.host,
            principal: x.principal,
            resourceType: x.resourceType,
            resourceName: x.resourceName,
            resourcePatternType: x.resourcePatternType as unknown as 'Literal' | 'Prefixed',
            operation: x.operation as unknown as Exclude<AclStrOperation, 'Unknown' | 'Any'>,
            permissionType: x.permissionType as unknown as 'Allow' | 'Deny',
          })
        );

        const results = await Promise.allSettled(requests);
        const rejected = results.filter((x) => x.status === 'rejected');
        if (rejected.length) {
          // biome-ignore lint/suspicious/noConsole: error logging
          console.error('some create acl requests failed', { results, rejected });
          throw new Error(`${rejected.length} requests failed`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setIsLoading(false);
        return;
      }

      if (p.type === 'create') {
        toast({
          status: 'success',
          description: (
            <Text as="span">
              Created ACLs for principal <Code>{group.principalName}</Code>
            </Text>
          ),
        });
      } else {
        toast({
          status: 'success',
          description: (
            <Text as="span">
              Updated ACLs for principal <Code>{group.principalName}</Code>
            </Text>
          ),
        });
      }

      setIsLoading(false);
      p.onClose();
    };

    if (!group.clusterAcls) {
      group.clusterAcls = createEmptyClusterAcl();
    }

    return (
      <Modal
        isOpen
        onClose={() => {
          // no op - modal is not closeable
        }}
      >
        <ModalOverlay />
        <ModalContent minW="6xl">
          <ModalHeader>{p.type === 'create' ? 'Create ACL' : 'Edit ACL'}</ModalHeader>
          <ModalBody>
            <VStack gap={6} w="full">
              <AnimatePresence>
                {Boolean(error) && (
                  <MotionDiv animProps={animProps_radioOptionGroup} style={{ color: 'red', fontWeight: 500 }}>
                    Error: {error}
                  </MotionDiv>
                )}
              </AnimatePresence>

              <HStack alignItems="flex-end" gap={10} w="full">
                <Label
                  text="User / Principal"
                  textSuffix={
                    <LabelTooltip left maxW={500} nowrap>
                      The user that gets the permissions granted (or denied).
                      <br />
                      In Kafka this is referred to as the "principal".
                      <br />
                      Do not include the prefix so <code>my-user</code> instead of <code>User:my-user</code>.<br />
                      You can use <code>*</code> to target all users.
                    </LabelTooltip>
                  }
                >
                  <InputGroup>
                    <Box minW={180} mr={2} zIndex={1}>
                      <SingleSelect<PrincipalType>
                        isDisabled
                        onChange={(value) => {
                          group.principalType = value;
                        }}
                        options={[
                          {
                            label: 'User',
                            value: 'User',
                          },
                        ]}
                        value={group.principalType}
                      />
                    </Box>

                    <Input
                      data-testid="principal-name"
                      onChange={(e) => {
                        if (e.target.value.includes(':')) {
                          return;
                        }
                        group.principalName = e.target.value;
                      }}
                      value={group.principalName}
                      {...{ spellCheck: false }}
                    />
                  </InputGroup>
                </Label>

                <Label
                  text="Host"
                  textSuffix={
                    <LabelTooltip left maxW={500} nowrap>
                      The host the user needs to connect from in order for the permissions to apply.
                      <br />
                      Can be set to left empty or set to <code>*</code> to allow any host.
                    </LabelTooltip>
                  }
                >
                  <Input
                    onChange={(e) => {
                      group.host = e.target.value;
                    }}
                    spellCheck={false}
                    value={group.host}
                    width="200px"
                  />
                </Label>

                <Button
                  onClick={() => {
                    if (group.topicAcls.length === 0) {
                      group.topicAcls.push(createEmptyTopicAcl());
                    }
                    group.topicAcls[0].selector = '*';
                    group.topicAcls[0].all = 'Allow';

                    if (group.consumerGroupAcls.length === 0) {
                      group.consumerGroupAcls.push(createEmptyConsumerGroupAcl());
                    }
                    group.consumerGroupAcls[0].selector = '*';
                    group.consumerGroupAcls[0].all = 'Allow';

                    if (group.transactionalIdAcls.length === 0) {
                      group.transactionalIdAcls.push(createEmptyTransactionalIdAcl());
                    }
                    group.transactionalIdAcls[0].selector = '*';
                    group.transactionalIdAcls[0].all = 'Allow';

                    group.clusterAcls.all = 'Allow';
                  }}
                  variant="outline"
                >
                  Allow all operations
                </Button>
              </HStack>

              {noNameOrNameInUse === true ? (
                <Box alignSelf="start" color="red" fontSize="small" fontWeight="500">
                  Creating new ACLs requires an unused principal name to be entered
                </Box>
              ) : null}

              <VStack pr={2} spacing={8} w="full">
                <Box as="section" w="full">
                  <Text fontWeight={500} my={4}>
                    Topics
                  </Text>
                  <Flex flexDirection="column" gap={4}>
                    {group.topicAcls.map((t, i) => (
                      <ResourceACLsEditor
                        key={`topic-${t.selector}-${i}`}
                        onDelete={() => group.topicAcls.remove(t)}
                        resource={t}
                        resourceType="Topic"
                        setIsFormValid={setTopicsIsValid}
                      />
                    ))}
                    <Button onClick={() => group.topicAcls.push(createEmptyTopicAcl())} variant="outline" width="100%">
                      Add Topic ACL
                    </Button>
                  </Flex>
                </Box>

                <Box as="section" w="full">
                  <Text fontWeight={500} my={4}>
                    Consumer Groups
                  </Text>
                  <Flex flexDirection="column" gap={4}>
                    {group.consumerGroupAcls.map((t, i) => (
                      <ResourceACLsEditor
                        key={`consumer-group-${t.selector}-${i}`}
                        onDelete={() => group.consumerGroupAcls.remove(t)}
                        resource={t}
                        resourceType="Group"
                        setIsFormValid={setConsumerGroupsIsValid}
                      />
                    ))}
                    <Button
                      onClick={() => group.consumerGroupAcls.push(createEmptyConsumerGroupAcl())}
                      variant="outline"
                      width="100%"
                    >
                      Add Consumer Group ACL
                    </Button>
                  </Flex>
                </Box>

                <Box as="section" w="full">
                  <Text fontWeight={500} my={4}>
                    Transactional ID
                  </Text>
                  <Flex flexDirection="column" gap={4}>
                    {group.transactionalIdAcls.map((t, i) => (
                      <ResourceACLsEditor
                        key={`transactional-id-${t.selector}-${i}`}
                        onDelete={() => group.transactionalIdAcls.remove(t)}
                        resource={t}
                        resourceType="TransactionalID"
                        setIsFormValid={setTransactionalIDIsValid}
                      />
                    ))}
                    <Button
                      onClick={() => group.transactionalIdAcls.push(createEmptyTransactionalIdAcl())}
                      variant="outline"
                      width="100%"
                    >
                      Add Transactional ID ACL
                    </Button>
                  </Flex>
                </Box>

                <Box as="section" w="full">
                  <Text fontWeight={500} my={4}>
                    Cluster
                  </Text>
                  <ResourceACLsEditor
                    resource={group.clusterAcls}
                    resourceType="Cluster"
                    setIsFormValid={setIsFormValid}
                  />
                </Box>
              </VStack>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button onClick={p.onClose} variant="secondary-ghost">
              Cancel
            </Button>
            <Button
              colorScheme="red"
              data-testid="ok-button"
              isDisabled={
                !(isFormValid && isTopicsValid && isConsumerGroupsValid && isTransactionalIDValid) || noNameOrNameInUse
              }
              isLoading={isLoading}
              onClick={onOK}
              variant="solid"
            >
              OK
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }
);

export const ResourceACLsEditor = observer(
  (p: {
    resource: ResourceACLs;
    resourceType: AclStrResourceType;
    setIsFormValid: (isValid: boolean) => void;
    onDelete?: () => void;
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
                      res.patternType = e;
                      if (e === 'Any') {
                        res.selector = '*';
                      } else {
                        res.selector = '';
                      }
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
                    res.selector = e.target.value;
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
                  res.all = perm;
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
                      (res.permissions as Record<string, unknown>)[operation] = perm;
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
  }
);
