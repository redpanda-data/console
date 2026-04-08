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

import { useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Heading } from 'components/redpanda-ui/components/typography';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

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
import { api, type RolePrincipal, rolesApi, useApiStoreHook } from '../../../state/backend-api';
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

  const originalPrincipals = useMemo(() => initialData?.principals ?? [], [initialData?.principals]);
  const editMode: boolean = Boolean(initialData?.roleName);

  const roleNameAlreadyExist = rolesApi.roles.includes(formState.roleName) && !editMode;

  const handleSubmit = async () => {
    setIsLoading(true);
    const principalsToRemove = originalPrincipals.filter(
      (op) => !formState.principals.some((cp) => cp.principalType === op.principalType && cp.name === op.name)
    );
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
      newRoleResult = await rolesApi.updateRoleMembership(roleName, formState.principals, principalsToRemove, true);
    } catch (err) {
      toast.error(`Failed to update role ${formState.roleName}`, { description: String(err) });
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
        toast.error(`Failed to update role ${formState.roleName}`, { description: String(err) });
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      toast.success(`Role ${roleResponse.roleName} successfully ${actionLabel}`);
      navigate({ to: `/security/roles/${encodeURIComponent(roleResponse.roleName)}/details` });
    }
  };

  return (
    <div>
      <div>
        <div className="flex flex-col gap-10">
          <div className="flex flex-row gap-20">
            <div>
              <Field>
                <FieldLabel>Role name</FieldLabel>
                <Input
                  className="w-[300px]"
                  data-testid="create-role__role-name"
                  disabled={editMode}
                  onChange={(v) => {
                    setFormState((prev) => ({ ...prev, roleName: v.target.value }));
                  }}
                  pattern="^[^,=]+$"
                  required
                  title="Please avoid using commas or equal signs."
                  value={formState.roleName}
                />
                {roleNameAlreadyExist && <FieldError>Role name already exist</FieldError>}
              </Field>
            </div>

            <Button
              className="self-end"
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
          </div>

          <Field>
            <FieldLabel>Host</FieldLabel>
            <FieldDescription>
              The host the user needs to connect from in order for the permissions to apply.
            </FieldDescription>
            <Input
              className="w-[600px]"
              onChange={(v) => {
                setFormState((prev) => ({ ...prev, host: v.target.value }));
              }}
              value={formState.host}
            />
          </Field>

          <div className="flex flex-col gap-4" data-testid="create-role-topics-section">
            <Heading level={3}>Topics</Heading>
            {formState.topicACLs.map((topicACL, index) => (
              <ResourceACLsEditor
                key={topicACL._key}
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

            <div>
              <Button
                onClick={() => {
                  setFormState((prev) => ({ ...prev, topicACLs: [...prev.topicACLs, createEmptyTopicAcl()] }));
                }}
                variant="outline"
              >
                Add Topic ACL
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4" data-testid="create-role-consumer-groups-section">
            <Heading level={3}>Consumer Groups</Heading>
            {formState.consumerGroupsACLs.map((acl, index) => (
              <ResourceACLsEditor
                key={acl._key}
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

            <div>
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
            </div>
          </div>

          <div className="flex flex-col gap-4" data-testid="create-role-transactional-ids-section">
            <Heading level={3}>Transactional IDs</Heading>
            {formState.transactionalIDACLs.map((acl, index) => (
              <ResourceACLsEditor
                key={acl._key}
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

            <div>
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
            </div>
          </div>

          <div className="flex flex-col gap-4" data-testid="create-role-cluster-section">
            <Heading level={3}>Cluster</Heading>
            <div className="flex items-center">
              <div className="flex-grow">
                <ResourceACLsEditor
                  onChange={(updated) => setFormState((prev) => ({ ...prev, clusterACLs: updated as ClusterACLs }))}
                  resource={formState.clusterACLs}
                  resourceType="Cluster"
                  setIsFormValid={setIsFormValid}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Heading level={3}>Principals</Heading>
            <Field>
              <FieldLabel>Assign this role to principals</FieldLabel>
              <FieldDescription>This can be edited later</FieldDescription>
              <PrincipalSelector
                onPrincipalsChange={(principals) => setFormState((prev) => ({ ...prev, principals }))}
                principals={formState.principals}
              />
            </Field>
          </div>
        </div>

        <div className="mt-8 flex gap-4">
          <Button disabled={isLoading || roleNameAlreadyExist || !isFormValid} onClick={handleSubmit} type="button">
            {isLoading ? (editMode ? 'Editing...' : 'Creating...') : editMode ? 'Update' : 'Create'}
          </Button>
          <Button
            onClick={() => {
              const path = editMode
                ? `/security/roles/${encodeURIComponent(initialData?.roleName as string)}/details`
                : '/security/roles/';
              appGlobal.historyPush(path);
            }}
            variant="link"
          >
            Go back
          </Button>
        </div>
      </div>
    </div>
  );
};

const PrincipalSelector = (p: {
  principals: RolePrincipal[];
  onPrincipalsChange: (principals: RolePrincipal[]) => void;
}) => {
  const enterpriseFeaturesUsed = useApiStoreHook((s) => s.enterpriseFeaturesUsed);
  const gbacEnabled = enterpriseFeaturesUsed.some((f) => f.name === 'gbac' && f.enabled);

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
      if (roleMember.principalType === 'User' && !availableUsers.any((u) => u.value === roleMember.name)) {
        availableUsers.push({ value: roleMember.name });
      }
    }
  }

  const availableGroups: { value: string }[] = [];
  for (const [_, roleMembers] of rolesApi.roleMembers) {
    for (const roleMember of roleMembers) {
      if (roleMember.principalType === 'Group' && !availableGroups.any((g) => g.value === roleMember.name)) {
        availableGroups.push({ value: roleMember.name });
      }
    }
  }

  const addPrincipal = (name: string, principalType: RolePrincipal['principalType']) => {
    if (name && !principals.some((p) => p.name === name && p.principalType === principalType)) {
      onPrincipalsChange([...principals, { name, principalType }]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="w-[300px]">
          <Combobox
            creatable
            onChange={(val) => {
              if (val) addPrincipal(val, 'User');
            }}
            options={availableUsers.map((u) => ({ value: u.value, label: u.value }))}
            placeholder="Add user"
          />
        </div>
        {gbacEnabled && (
          <div className="w-[300px]">
            <Combobox
              creatable
              onChange={(val) => {
                if (val) addPrincipal(val, 'Group');
              }}
              options={availableGroups.map((g) => ({ value: g.value, label: g.value }))}
              placeholder="Add group"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {principals.map((principal) => (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            key={`${principal.principalType}:${principal.name}`}
          >
            <span>
              {principal.principalType}: {principal.name}
            </span>
            <Button
              className="h-auto p-0"
              onClick={() => onPrincipalsChange(principals.filter((pr) => pr !== principal))}
              size="icon-xs"
              variant="ghost"
            >
              <X className="h-3 w-3" />
            </Button>
          </span>
        ))}
      </div>
    </div>
  );
};
