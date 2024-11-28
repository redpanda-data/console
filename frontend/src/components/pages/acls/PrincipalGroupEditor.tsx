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
  VStack,
  useToast,
} from '@redpanda-data/ui';
import { comparer } from 'mobx';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { HiOutlineTrash } from 'react-icons/hi';
import { api } from '../../../state/backendApi';
import { AclOperation, type AclStrOperation, type AclStrResourceType } from '../../../state/restInterfaces';
import { AnimatePresence, MotionDiv, animProps_radioOptionGroup } from '../../../utils/animationProps';
import { Code, Label, LabelTooltip } from '../../../utils/tsxUtils';
import { SingleSelect } from '../../misc/Select';
import {
  type AclPrincipalGroup,
  type PrincipalType,
  type ResourceACLs,
  createEmptyClusterAcl,
  createEmptyConsumerGroupAcl,
  createEmptyTopicAcl,
  createEmptyTransactionalIdAcl,
  unpackPrincipalGroup,
} from './Models';
import { Operation } from './Operation';

export const AclPrincipalGroupEditor = observer(
  (p: {
    principalGroup: AclPrincipalGroup;
    type: 'create' | 'edit';
    onClose: () => void;
  }) => {
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

    const onOK = async () => {
      setError(undefined);
      setIsLoading(true);
      try {
        if (group.principalName.length === 0) throw new Error('The principal field can not be empty.');

        const allToCreate = unpackPrincipalGroup(group);

        if (allToCreate.length === 0) {
          if (p.type === 'create') {
            throw new Error(
              'Creating an ACL group requires at least one resource to be targeted. Topic/Group targets with an empty selector are not valid.',
            );
          }
          throw new Error('No targeted resources. You can delete this ACL group from the list view.');
        }

        // Ignore creation of ACLs that already exist, and delete ACLs that are no longer needed
        if (p.type === 'edit') {
          if (group.sourceEntries.length > 0) {
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
          }),
        );

        const results = await Promise.allSettled(requests);
        const rejected = results.filter((x) => x.status === 'rejected');
        if (rejected.length) {
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

    if (!group.clusterAcls) group.clusterAcls = createEmptyClusterAcl();

    return (
      <Modal isOpen onClose={() => {}}>
        <ModalOverlay />
        <ModalContent minW="6xl">
          <ModalHeader>{p.type === 'create' ? 'Create ACL' : 'Edit ACL'}</ModalHeader>
          <ModalBody>
            <VStack gap={6} w="full">
              <AnimatePresence>
                {error && (
                  <MotionDiv animProps={animProps_radioOptionGroup} style={{ color: 'red', fontWeight: 500 }}>
                    Error: {error}
                  </MotionDiv>
                )}
              </AnimatePresence>

              <HStack gap={10} alignItems="flex-end" w="full">
                <Label
                  text="User / Principal"
                  textSuffix={
                    <LabelTooltip nowrap left maxW={500}>
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
                    <Box mr={2} minW={180} zIndex={1}>
                      <SingleSelect<PrincipalType>
                        isDisabled
                        value={group.principalType}
                        options={[
                          {
                            label: 'User',
                            value: 'User',
                          },
                        ]}
                        onChange={(value) => (group.principalType = value)}
                      />
                    </Box>

                    <Input
                      data-testid="principal-name"
                      value={group.principalName}
                      onChange={(e) => {
                        if (e.target.value.includes(':')) {
                          return;
                        }
                        group.principalName = e.target.value;
                      }}
                      {...{ spellCheck: false }}
                    />
                  </InputGroup>
                </Label>

                <Label
                  text="Host"
                  textSuffix={
                    <LabelTooltip nowrap left maxW={500}>
                      The host the user needs to connect from in order for the permissions to apply.
                      <br />
                      Can be set to left empty or set to <code>*</code> to allow any host.
                    </LabelTooltip>
                  }
                >
                  <Input
                    width="200px"
                    value={group.host}
                    onChange={(e) => (group.host = e.target.value)}
                    spellCheck={false}
                  />
                </Label>

                <Button
                  variant="outline"
                  onClick={() => {
                    if (group.topicAcls.length === 0) group.topicAcls.push(createEmptyTopicAcl());
                    group.topicAcls[0].selector = '*';
                    group.topicAcls[0].all = 'Allow';

                    if (group.consumerGroupAcls.length === 0)
                      group.consumerGroupAcls.push(createEmptyConsumerGroupAcl());
                    group.consumerGroupAcls[0].selector = '*';
                    group.consumerGroupAcls[0].all = 'Allow';

                    if (group.transactionalIdAcls.length === 0)
                      group.transactionalIdAcls.push(createEmptyTransactionalIdAcl());
                    group.transactionalIdAcls[0].selector = '*';
                    group.transactionalIdAcls[0].all = 'Allow';

                    group.clusterAcls.all = 'Allow';
                  }}
                >
                  Allow all operations
                </Button>
              </HStack>

              {noNameOrNameInUse === true ? (
                <Box color="red" alignSelf="start" fontWeight="500" fontSize="small">
                  Creating new ACLs requires an unused principal name to be entered
                </Box>
              ) : null}

              <VStack spacing={8} pr={2} w="full">
                <Box w="full" as="section">
                  <Text my={4} fontWeight={500}>
                    Topics
                  </Text>
                  <Flex gap={4} flexDirection="column">
                    {group.topicAcls.map((t, i) => (
                      <ResourceACLsEditor
                        key={i}
                        resourceType="Topic"
                        resource={t}
                        setIsFormValid={setTopicsIsValid}
                        onDelete={() => group.topicAcls.remove(t)}
                      />
                    ))}
                    <Button variant="outline" width="100%" onClick={() => group.topicAcls.push(createEmptyTopicAcl())}>
                      Add Topic ACL
                    </Button>
                  </Flex>
                </Box>

                <Box w="full" as="section">
                  <Text my={4} fontWeight={500}>
                    Consumer Groups
                  </Text>
                  <Flex gap={4} flexDirection="column">
                    {group.consumerGroupAcls.map((t, i) => (
                      <ResourceACLsEditor
                        key={i}
                        resourceType="Group"
                        resource={t}
                        setIsFormValid={setConsumerGroupsIsValid}
                        onDelete={() => group.consumerGroupAcls.remove(t)}
                      />
                    ))}
                    <Button
                      variant="outline"
                      width="100%"
                      onClick={() => group.consumerGroupAcls.push(createEmptyConsumerGroupAcl())}
                    >
                      Add Consumer Group ACL
                    </Button>
                  </Flex>
                </Box>

                <Box w="full" as="section">
                  <Text my={4} fontWeight={500}>
                    Transactional ID
                  </Text>
                  <Flex gap={4} flexDirection="column">
                    {group.transactionalIdAcls.map((t, i) => (
                      <ResourceACLsEditor
                        key={i}
                        resourceType="TransactionalID"
                        resource={t}
                        setIsFormValid={setTransactionalIDIsValid}
                        onDelete={() => group.transactionalIdAcls.remove(t)}
                      />
                    ))}
                    <Button
                      variant="outline"
                      width="100%"
                      onClick={() => group.transactionalIdAcls.push(createEmptyTransactionalIdAcl())}
                    >
                      Add Transactional ID ACL
                    </Button>
                  </Flex>
                </Box>

                <Box w="full" as="section">
                  <Text my={4} fontWeight={500}>
                    Cluster
                  </Text>
                  <ResourceACLsEditor
                    resourceType="Cluster"
                    setIsFormValid={setIsFormValid}
                    resource={group.clusterAcls}
                  />
                </Box>
              </VStack>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={p.onClose}>
              Cancel
            </Button>
            <Button
              data-testid="ok-button"
              variant="solid"
              colorScheme="red"
              onClick={onOK}
              isLoading={isLoading}
              isDisabled={
                !isFormValid || !isTopicsValid || !isConsumerGroupsValid || !isTransactionalIDValid || noNameOrNameInUse
              }
            >
              OK
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  },
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
    if (p.resourceType === 'Topic') resourceName = 'Topic';
    if (p.resourceType === 'Group') resourceName = 'Consumer Group';
    if (p.resourceType === 'TransactionalID') resourceName = 'Transactional ID';

    const isInvalid =
      (!isCluster && res.patternType === 'Literal' && res.selector === '') ||
      (!isCluster && res.patternType === 'Prefixed' && res.selector === '');

    const errorText = 'Selector cannot be empty';
    p.setIsFormValid(!isInvalid);

    return (
      <Flex
        flexDirection="row"
        gap={5}
        border="1px solid"
        borderColor="gray.300"
        borderRadius="md"
        boxShadow="0px 1px 2px 0px #0000000F"
      >
        <Flex flexDirection="column" flexGrow={1} gap={10} p={6}>
          {isCluster ? (
            <Text fontWeight={600} whiteSpace="nowrap">
              Applies to whole cluster
            </Text>
          ) : (
            <FormField label={`Selector (${resourceName} Name)`} errorText={errorText} isInvalid={isInvalid}>
              <InputGroup zIndex={1} data-testid={`${resourceName}-input-group`}>
                <InputLeftAddon padding="0px" width="124px">
                  <SingleSelect<'Any' | 'Literal' | 'Prefixed'>
                    options={[
                      { value: 'Any', label: 'Any' },
                      { value: 'Literal', label: 'Literal' },
                      { value: 'Prefixed', label: 'Prefixed' },
                    ]}
                    value={res.patternType as 'Any' | 'Literal' | 'Prefixed'}
                    onChange={(e) => {
                      res.patternType = e;
                      if (e === 'Any') {
                        res.selector = '*';
                      } else {
                        res.selector = '';
                      }
                    }}
                    isSearchable={false}
                    chakraStyles={{
                      container: (_p, _s) => {
                        return {
                          flexGrow: 1,
                          marginLeft: '-1px',
                          marginRight: '-1px',
                          cursor: 'pointer',
                        };
                      },
                    }}
                  />
                </InputLeftAddon>
                <Input
                  data-testid={`${resourceName}-selector`}
                  value={res.selector}
                  onChange={(e) => (res.selector = e.target.value)}
                  isDisabled={res.patternType === 'Any'}
                  spellCheck={false}
                />
              </InputGroup>
            </FormField>
          )}

          <Label text="Operations" style={{ width: '100%' }}>
            <Grid templateColumns="repeat(auto-fill, minmax(125px, 1fr))" gap={6} width="full">
              <Operation operation={AclOperation.All} value={res.all} onChange={(p) => (res.all = p)} />

              {Object.entries(res.permissions)
                .sort(([op1], [op2]) => op1.localeCompare(op2))
                .map(([operation, permission]) => (
                  <Operation
                    data-testid={`${resourceName}-${operation}`}
                    key={operation}
                    operation={operation}
                    value={isAllSet ? res.all : permission}
                    onChange={(p) => ((res.permissions as any)[operation] = p)}
                    disabled={isAllSet}
                  />
                ))}
            </Grid>
          </Label>
        </Flex>

        {p.onDelete && (
          <Flex>
            <Box height="80%" width="1px" bg="gray.300" alignSelf="center" />
            <Button variant="ghost" onClick={p.onDelete} alignSelf="center" mx={2}>
              <Icon as={HiOutlineTrash} fontSize="22px" />
            </Button>
          </Flex>
        )}
      </Flex>
    );
  },
);
