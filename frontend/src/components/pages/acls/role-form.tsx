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
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

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

export const RoleForm = ({ initialData }: RoleFormProps) => {
  const navigate = useNavigate();
  const [formState, setFormState] = useState<CreateRoleFormState>(() => {
    const initial: CreateRoleFormState = {
      roleName: '',
      allowAllOperations: false,
      host: '',
      topicACLs: [createEmptyTopicAcl()],
      consumerGroupsACLs: [createEmptyConsumerGroupAcl()],
      transactionalIDACLs: [createEmptyTransactionalIdAcl()],
      clusterACLs: createEmptyClusterAcl(),
      principals: [],
      ...initialData,
    };
    if (!initial.clusterACLs) {
      initial.clusterACLs = createEmptyClusterAcl();
    }
    return initial;
  });

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
          setIsLoading(true);
          const usersToRemove = originalUsernames.filter((item) => currentUsernames.indexOf(item) === -1);
          const principalType: AclStrResourceType = 'RedpandaRole';
          const isEditMode = editMode;
          const roleName = formState.roleName;
          const aclPrincipalGroup: AclPrincipalGroup = {
            principalType: 'RedpandaRole',
            principalName: roleName,
            host: formState.host,
            topicAcls: formState.topicACLs,
            consumerGroupAcls: formState.consumerGroupsACLs,
            transactionalIdAcls: formState.transactionalIDACLs,
            clusterAcls: formState.clusterACLs,
            sourceEntries: [],
          };
          const principalNames = formState.principals.map((x) => x.name);
          const deleteAclsArgs = isEditMode
            ? {
                resourceType: 'Any' as const,
                resourceName: undefined,
                principal: `${principalType}:${roleName}`,
                resourcePatternType: 'Any' as const,
                operation: 'Any' as const,
                permissionType: 'Any' as const,
              }
            : null;
          const actionLabel = isEditMode ? 'updated' : 'created';
          const deleteAclsPromise = deleteAclsArgs ? api.deleteACLs(deleteAclsArgs) : Promise.resolve();
          let newRoleResult: Awaited<ReturnType<typeof rolesApi.updateRoleMembership>> | null = null;
          try {
            await deleteAclsPromise;
            newRoleResult = await rolesApi.updateRoleMembership(roleName, principalNames, usersToRemove, true);
          } catch (err) {
            toast({
              status: 'error',
              duration: null,
              isClosable: true,
              title: `Failed to update role ${formState.roleName}`,
              description: String(err),
            });
            setIsLoading(false);
            return;
          }

          const roleResponse = newRoleResult ? newRoleResult.response : null;
          if (roleResponse) {
            const unpackedPrincipalGroup = unpackPrincipalGroup(aclPrincipalGroup);
            const aclCreatePromises = unpackedPrincipalGroup.map((aclFlat) =>
              api.createACL({
                host: aclFlat.host,
                principal: aclFlat.principal,
                resourceType: aclFlat.resourceType,
                resourceName: aclFlat.resourceName,
                resourcePatternType: aclFlat.resourcePatternType as unknown as 'Literal' | 'Prefixed',
                operation: aclFlat.operation as unknown as Exclude<AclStrOperation, 'Unknown' | 'Any'>,
                permissionType: aclFlat.permissionType as unknown as 'Allow' | 'Deny',
              })
            );
            try {
              await Promise.all(aclCreatePromises);
            } catch (err) {
              toast({
                status: 'error',
                duration: null,
                isClosable: true,
                title: `Failed to update role ${formState.roleName}`,
                description: String(err),
              });
              setIsLoading(false);
              return;
            }
            setIsLoading(false);
            toast({
              status: 'success',
              title: `Role ${roleResponse.roleName} successfully ${actionLabel}`,
            });
            navigate({ to: `/security/roles/${encodeURIComponent(roleResponse.roleName)}/details` });
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
                  onChange={(v) => {
                    setFormState((prev) => ({ ...prev, roleName: v.target.value }));
                  }}
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
                setFormState((prev) => {
                  const topicACLs = prev.topicACLs.length === 0 ? [createEmptyTopicAcl()] : [...prev.topicACLs];
                  topicACLs[0] = { ...topicACLs[0], selector: '*', all: 'Allow' };

                  const consumerGroupsACLs =
                    prev.consumerGroupsACLs.length === 0
                      ? [createEmptyConsumerGroupAcl()]
                      : [...prev.consumerGroupsACLs];
                  consumerGroupsACLs[0] = { ...consumerGroupsACLs[0], selector: '*', all: 'Allow' };

                  const transactionalIDACLs =
                    prev.transactionalIDACLs.length === 0
                      ? [createEmptyTransactionalIdAcl()]
                      : [...prev.transactionalIDACLs];
                  transactionalIDACLs[0] = { ...transactionalIDACLs[0], selector: '*', all: 'Allow' };

                  return {
                    ...prev,
                    topicACLs,
                    consumerGroupsACLs,
                    transactionalIDACLs,
                    clusterACLs: { ...prev.clusterACLs, all: 'Allow' },
                  };
                });
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
            <Input
              onChange={(v) => {
                setFormState((prev) => ({ ...prev, host: v.target.value }));
              }}
              value={formState.host}
              width={600}
            />
          </FormField>

          <Flex data-testid="create-role-topics-section" flexDirection="column" gap={4}>
            <Heading>Topics</Heading>
            {formState.topicACLs.map((topicACL, index) => (
              <ResourceACLsEditor
                key={`topic-${topicACL.selector}-${index}`}
                onChange={(updated) =>
                  setFormState((prev) => ({
                    ...prev,
                    topicACLs: prev.topicACLs.map((t, i) => (i === index ? (updated as TopicACLs) : t)),
                  }))
                }
                onDelete={() => {
                  setFormState((prev) => ({
                    ...prev,
                    topicACLs: prev.topicACLs.filter((_, i) => i !== index),
                  }));
                }}
                resource={topicACL}
                resourceType="Topic"
                setIsFormValid={setIsFormValid}
              />
            ))}

            <Box>
              <Button
                onClick={() => {
                  setFormState((prev) => ({ ...prev, topicACLs: [...prev.topicACLs, createEmptyTopicAcl()] }));
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
                onChange={(updated) =>
                  setFormState((prev) => ({
                    ...prev,
                    consumerGroupsACLs: prev.consumerGroupsACLs.map((t, i) =>
                      i === index ? (updated as ConsumerGroupACLs) : t
                    ),
                  }))
                }
                onDelete={() => {
                  setFormState((prev) => ({
                    ...prev,
                    consumerGroupsACLs: prev.consumerGroupsACLs.filter((_, i) => i !== index),
                  }));
                }}
                resource={acl}
                resourceType="Group"
                setIsFormValid={setIsFormValid}
              />
            ))}

            <Box>
              <Button
                onClick={() => {
                  setFormState((prev) => ({
                    ...prev,
                    consumerGroupsACLs: [...prev.consumerGroupsACLs, createEmptyConsumerGroupAcl()],
                  }));
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
                onChange={(updated) =>
                  setFormState((prev) => ({
                    ...prev,
                    transactionalIDACLs: prev.transactionalIDACLs.map((t, i) =>
                      i === index ? (updated as TransactionalIdACLs) : t
                    ),
                  }))
                }
                onDelete={() => {
                  setFormState((prev) => ({
                    ...prev,
                    transactionalIDACLs: prev.transactionalIDACLs.filter((_, i) => i !== index),
                  }));
                }}
                resource={acl}
                resourceType="TransactionalID"
                setIsFormValid={setIsFormValid}
              />
            ))}

            <Box>
              <Button
                onClick={() => {
                  setFormState((prev) => ({
                    ...prev,
                    transactionalIDACLs: [...prev.transactionalIDACLs, createEmptyTransactionalIdAcl()],
                  }));
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
                  onChange={(updated) => setFormState((prev) => ({ ...prev, clusterACLs: updated as ClusterACLs }))}
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
              <PrincipalSelector
                onPrincipalsChange={(principals) => setFormState((prev) => ({ ...prev, principals }))}
                principals={formState.principals}
              />
            </FormField>
          </Flex>
        </Flex>

        <Flex gap={4} mt={8}>
          {editMode ? (
            <Button
              isDisabled={roleNameAlreadyExist || !isFormValid}
              isLoading={isLoading}
              loadingText="Editing..."
              type="submit"
            >
              Update
            </Button>
          ) : (
            <Button
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
};

const PrincipalSelector = (p: {
  principals: RolePrincipal[];
  onPrincipalsChange: (principals: RolePrincipal[]) => void;
}) => {
  const [searchValue, setSearchValue] = useState<string>('');

  useEffect(() => {
    api.refreshServiceAccounts().catch(() => {
      // Error handling managed by API layer
    });
  }, []);

  const { principals, onPrincipalsChange } = p;

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
              onPrincipalsChange([...principals, { name: val.value, principalType: 'User' }]);
              setSearchValue('');
            }
          }}
          onInputChange={setSearchValue}
          options={availableUsers}
          placeholder="Find users"
        />
      </Box>

      <Flex gap={2}>
        {principals.map((principal) => (
          <Tag cursor="pointer" key={principal.name}>
            <TagLabel>{principal.name}</TagLabel>
            <TagCloseButton onClick={() => onPrincipalsChange(principals.filter((pr) => pr !== principal))} />
          </Tag>
        ))}
      </Flex>
    </Flex>
  );
};
