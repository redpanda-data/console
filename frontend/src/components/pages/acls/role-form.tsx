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
  Heading,
  HStack,
  Input,
  isSingleValue,
  Select,
  Tag,
  TagCloseButton,
  TagLabel,
  useToast,
} from '@redpanda-data/ui';
import { observer, useLocalObservable } from 'mobx-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  type AclPrincipalGroup,
  type ClusterACLs,
  type ConsumerGroupACLs,
  createEmptyClusterAcl,
  createEmptyConsumerGroupAcl,
  createEmptyTopicAcl,
  createEmptyTransactionalIdAcl,
  principalGroupsView,
  type TopicACLs,
  type TransactionalIdACLs,
  unpackPrincipalGroup,
} from './models';
import { ResourceACLsEditor } from './principal-group-editor';
import { appGlobal } from '../../../state/app-global';
import { api, type RolePrincipal, rolesApi } from '../../../state/backend-api';
import type { AclStrOperation, AclStrResourceType } from '../../../state/rest-interfaces';

type CreateRoleFormState = {
  roleName: string;
  allowAllOperations: boolean;
  host: string;
  topicACLs: TopicACLs[];
  consumerGroupsACLs: ConsumerGroupACLs[];
  transactionalIDACLs: TransactionalIdACLs[];
  clusterACLs: ClusterACLs;
  principals: RolePrincipal[];
};

type RoleFormProps = {
  initialData?: Partial<CreateRoleFormState>;
};

export const RoleForm = observer(({ initialData }: RoleFormProps) => {
  const navigate = useNavigate();
  const formState = useLocalObservable<CreateRoleFormState>(() => ({
    roleName: '',
    allowAllOperations: false,
    host: '',
    topicACLs: [createEmptyTopicAcl()],
    consumerGroupsACLs: [createEmptyConsumerGroupAcl()],
    transactionalIDACLs: [createEmptyTransactionalIdAcl()],
    clusterACLs: createEmptyClusterAcl(),
    principals: [],
    ...initialData,
  }));

  if (!formState.clusterACLs) {
    formState.clusterACLs = createEmptyClusterAcl();
  }

  const [isFormValid, setIsFormValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const originalUsernames = useMemo(
    () => initialData?.principals?.map(({ name }) => name) ?? [],
    [initialData?.principals]
  );
  const currentUsernames = formState.principals.map(({ name }) => name) ?? [];
  const editMode: boolean = Boolean(initialData?.roleName);

  const roleNameAlreadyExist = rolesApi.roles.includes(formState.roleName) && !editMode;

  return (
    <Box>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setIsLoading(true);
            const usersToRemove = originalUsernames.filter((item) => currentUsernames.indexOf(item) === -1);

            const principalType: AclStrResourceType = 'RedpandaRole';

            if (editMode) {
              await api.deleteACLs({
                resourceType: 'Any',
                resourceName: undefined,
                principal: `${principalType}:${formState.roleName}`,
                resourcePatternType: 'Any',
                operation: 'Any',
                permissionType: 'Any',
              });
            }

            const aclPrincipalGroup: AclPrincipalGroup = {
              principalType: 'RedpandaRole',
              principalName: formState.roleName,

              host: formState.host,

              topicAcls: formState.topicACLs,
              consumerGroupAcls: formState.consumerGroupsACLs,
              transactionalIdAcls: formState.transactionalIDACLs,
              clusterAcls: formState.clusterACLs,
              sourceEntries: [],
            };

            const newRole = await rolesApi.updateRoleMembership(
              formState.roleName,
              formState.principals.map((x) => x.name),
              usersToRemove,
              true
            );

            if (newRole.response) {
              const unpackedPrincipalGroup = unpackPrincipalGroup(aclPrincipalGroup);

              for (const aclFlat of unpackedPrincipalGroup) {
                await api.createACL({
                  host: aclFlat.host,
                  principal: aclFlat.principal,
                  resourceType: aclFlat.resourceType,
                  resourceName: aclFlat.resourceName,
                  resourcePatternType: aclFlat.resourcePatternType as unknown as 'Literal' | 'Prefixed',
                  operation: aclFlat.operation as unknown as Exclude<AclStrOperation, 'Unknown' | 'Any'>,
                  permissionType: aclFlat.permissionType as unknown as 'Allow' | 'Deny',
                });
              }

              setIsLoading(false);
              toast({
                status: 'success',
                title: `Role ${newRole.response.roleName} successfully ${editMode ? 'updated' : 'created'}`,
              });

              navigate(`/security/roles/${encodeURIComponent(newRole.response.roleName)}/details`);
            }
          } catch (err) {
            toast({
              status: 'error',
              duration: null,
              isClosable: true,
              title: `Failed to update role ${formState.roleName}`,
              description: String(err),
            });
          } finally {
            setIsLoading(false);
          }
        }}
      >
        <Flex flexDirection="column" gap={10}>
          <Flex flexDirection="row" gap={20}>
            <Box>
              <FormField errorText="Role name already exist" isInvalid={roleNameAlreadyExist} label="Role name">
                <Input
                  data-testid="create-role__role-name"
                  isDisabled={editMode}
                  isRequired
                  onChange={(v) => (formState.roleName = v.target.value)}
                  pattern="^[^,=]+$"
                  title="Please avoid using commas or equal signs."
                  value={formState.roleName}
                  width={300}
                />
              </FormField>
            </Box>

            <Button
              alignSelf="self-end"
              data-testid="roles-allow-all-operations"
              onClick={() => {
                if (formState.topicACLs.length === 0) {
                  formState.topicACLs.push(createEmptyTopicAcl());
                }
                formState.topicACLs[0].selector = '*';
                formState.topicACLs[0].all = 'Allow';

                if (formState.consumerGroupsACLs.length === 0) {
                  formState.consumerGroupsACLs.push(createEmptyConsumerGroupAcl());
                }
                formState.consumerGroupsACLs[0].selector = '*';
                formState.consumerGroupsACLs[0].all = 'Allow';

                if (formState.transactionalIDACLs.length === 0) {
                  formState.transactionalIDACLs.push(createEmptyTransactionalIdAcl());
                }
                formState.transactionalIDACLs[0].selector = '*';
                formState.transactionalIDACLs[0].all = 'Allow';

                formState.clusterACLs.all = 'Allow';
              }}
              variant="outline"
            >
              Allow all operations
            </Button>
          </Flex>

          <FormField
            description="The host the user needs to connect from in order for the permissions to apply."
            label="Host"
          >
            <Input onChange={(v) => (formState.host = v.target.value)} value={formState.host} width={600} />
          </FormField>

          <Flex data-testid="create-role-topics-section" flexDirection="column" gap={4}>
            <Heading>Topics</Heading>
            {formState.topicACLs.map((topicACL, index) => (
              <ResourceACLsEditor
                key={`topic-${topicACL.selector}-${index}`}
                onDelete={() => {
                  formState.topicACLs.splice(index, 1);
                }}
                resource={topicACL}
                resourceType="Topic"
                setIsFormValid={setIsFormValid}
              />
            ))}

            <Box>
              <Button
                onClick={() => {
                  formState.topicACLs.push(createEmptyTopicAcl());
                }}
                variant="outline"
              >
                Add Topic ACL
              </Button>
            </Box>
          </Flex>

          <Flex data-testid="create-role-consumer-groups-section" flexDirection="column" gap={4}>
            <Heading>Consumer Groups</Heading>
            {formState.consumerGroupsACLs.map((acl, index) => (
              <ResourceACLsEditor
                key={`consumer-group-${acl.selector}-${index}`}
                onDelete={() => {
                  formState.consumerGroupsACLs.splice(index, 1);
                }}
                resource={acl}
                resourceType="Group"
                setIsFormValid={setIsFormValid}
              />
            ))}

            <Box>
              <Button
                onClick={() => {
                  formState.consumerGroupsACLs.push(createEmptyConsumerGroupAcl());
                }}
                variant="outline"
              >
                Add consumer group ACL
              </Button>
            </Box>
          </Flex>

          <Flex data-testid="create-role-transactional-ids-section" flexDirection="column" gap={4}>
            <Heading>Transactional IDs</Heading>
            {formState.transactionalIDACLs.map((acl, index) => (
              <ResourceACLsEditor
                key={`transactional-id-${acl.selector}-${index}`}
                onDelete={() => {
                  formState.transactionalIDACLs.splice(index, 1);
                }}
                resource={acl}
                resourceType="TransactionalID"
                setIsFormValid={setIsFormValid}
              />
            ))}

            <Box>
              <Button
                onClick={() => {
                  formState.transactionalIDACLs.push(createEmptyTransactionalIdAcl());
                }}
                variant="outline"
              >
                Add Transactional ID ACL
              </Button>
            </Box>
          </Flex>

          <Flex data-testid="create-role-cluster-section" flexDirection="column" gap={4}>
            <Heading>Cluster</Heading>
            <HStack>
              <Box flexGrow={1}>
                <ResourceACLsEditor
                  resource={formState.clusterACLs}
                  resourceType="Cluster"
                  setIsFormValid={setIsFormValid}
                />
              </Box>
            </HStack>
          </Flex>

          <Flex flexDirection="column" gap={4}>
            <Heading>Principals</Heading>
            <FormField description="This can be edited later" label="Assign this role to principals">
              <PrincipalSelector state={formState.principals} />
            </FormField>
          </Flex>
        </Flex>

        <Flex gap={4} mt={8}>
          {editMode ? (
            <Button
              colorScheme="brand"
              isDisabled={roleNameAlreadyExist || !isFormValid}
              isLoading={isLoading}
              loadingText="Editing..."
              type="submit"
            >
              Update
            </Button>
          ) : (
            <Button
              colorScheme="brand"
              isDisabled={roleNameAlreadyExist || !isFormValid}
              isLoading={isLoading}
              loadingText="Creating..."
              type="submit"
            >
              Create
            </Button>
          )}
          {editMode ? (
            <Button
              onClick={() => {
                appGlobal.historyPush(`/security/roles/${encodeURIComponent(initialData?.roleName as string)}/details`);
              }}
              variant="link"
            >
              Go back
            </Button>
          ) : (
            <Button
              onClick={() => {
                appGlobal.historyPush('/security/roles/');
              }}
              variant="link"
            >
              Go back
            </Button>
          )}
        </Flex>
      </form>
    </Box>
  );
});

const PrincipalSelector = observer((p: { state: RolePrincipal[] }) => {
  const [searchValue, setSearchValue] = useState<string>('');

  useEffect(() => {
    api.refreshServiceAccounts().catch(() => {
      // Error handling managed by API layer
    });
  }, []);

  const state = p.state;

  const availableUsers =
    api.serviceAccounts?.users.map((u) => ({
      value: u,
    })) ?? [];

  // Add all inferred users
  // In addition, find all principals that are referenced by roles, or acls, that are not service accounts
  for (const g of principalGroupsView.principalGroups) {
    if (
      g.principalType === 'User' &&
      !g.principalName.includes('*') &&
      !availableUsers.any((u) => u.value === g.principalName)
    ) {
      // is it a user that is being referenced?
      // is the user already listed as a service account?
      availableUsers.push({ value: g.principalName });
    }
  }

  for (const [_, roleMembers] of rolesApi.roleMembers) {
    for (const roleMember of roleMembers) {
      if (!availableUsers.any((u) => u.value === roleMember.name)) {
        // make sure that user isn't already in the list
        availableUsers.push({ value: roleMember.name });
      }
    }
  }

  return (
    <Flex direction="column" gap={4}>
      <Box w={200}>
        <Select<string>
          creatable={true}
          inputValue={searchValue}
          isMulti={false}
          onChange={(val) => {
            if (val && isSingleValue(val) && val.value) {
              state.push({ name: val.value, principalType: 'User' });
              setSearchValue('');
            }
          }}
          onInputChange={setSearchValue}
          options={availableUsers}
          placeholder="Find users"
        />
      </Box>

      <Flex gap={2}>
        {state.map((principal) => (
          <Tag cursor="pointer" key={principal.name}>
            <TagLabel>{principal.name}</TagLabel>
            <TagCloseButton onClick={() => state.remove(principal)} />
          </Tag>
        ))}
      </Flex>
    </Flex>
  );
});
