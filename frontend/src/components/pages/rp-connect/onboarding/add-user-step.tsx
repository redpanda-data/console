import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { ServiceAccountSelectorRef } from 'components/ui/service-account/service-account-selector';
import type { MotionProps } from 'motion/react';
import { ACL_ResourcePatternType, ACL_ResourceType } from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import type { ListUsersResponse_User as User } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useListUsersQuery } from 'react-query/api/user';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { toast } from 'sonner';
import { generatePassword } from 'utils/password';
import { generateServiceAccountName } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import type { SASL_MECHANISMS } from 'utils/user';

import { AddUserFormBody } from './add-user-fields';
import { StepSurface } from './step-surface';
import { useListACLsQuery } from '../../../../react-query/api/acl';
import { userSecretIds } from '../types/constants';
import type { UserStepRef, UserStepSubmissionResult } from '../types/wizard';
import {
  type AddUserFormData,
  AuthenticationMethod,
  type AuthenticationMethodType,
  addUserFormSchema,
  CreatableSelectionOptions,
  type CreatableSelectionType,
  type ServiceAccountSubmissionData,
} from '../types/wizard';
import {
  checkUserHasConsumerGroupPermissions,
  checkUserHasTopicPermissions,
  saslMechanismFromProto,
  type TopicAccess,
  useCreateUserWithSecretsMutation,
} from '../utils/user';

export type AddUserStepProps = {
  defaultUsername?: string;
  defaultSaslMechanism?: (typeof SASL_MECHANISMS)[number];
  hideInternal?: boolean;
  topicName?: string;
  /** A user who can already do this with the topic is granted nothing more. */
  topicAccess?: TopicAccess;
  defaultConsumerGroup?: string;
  showConsumerGroupFields?: boolean;
  onValidityChange?: (isValid: boolean) => void;
  defaultAuthMethod?: 'sasl' | 'service-account';
  defaultServiceAccountName?: string;
  /** The pipeline already has a service account, which the Service account tab keeps instead of creating one. */
  hasServiceAccount?: boolean;
  pipelineName?: string;
  selectionMode?: 'existing' | 'new' | 'both';
  hideTitle?: boolean;
  className?: string;
  // Renders the form bare (no Card chrome/min-height/margin) so it can sit
  // inside a host surface like a dialog body. Defaults to false for the wizard.
  inline?: boolean;
};

export type UserForm = UseFormReturn<AddUserFormData>;
type SubmitUser = (userData: AddUserFormData) => Promise<UserStepSubmissionResult>;

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useAddUserForm({
  defaultUsername,
  defaultSaslMechanism,
  defaultConsumerGroup,
}: Pick<AddUserStepProps, 'defaultUsername' | 'defaultSaslMechanism' | 'defaultConsumerGroup'>) {
  return useForm<AddUserFormData>({
    resolver: zodResolver(
      addUserFormSchema.extend({
        grantTopicPermissions: addUserFormSchema.shape.grantTopicPermissions.removeDefault(),
        specialCharactersEnabled: addUserFormSchema.shape.specialCharactersEnabled.removeDefault(),
        passwordLength: addUserFormSchema.shape.passwordLength.removeDefault(),
      })
    ),
    mode: 'onChange',
    defaultValues: {
      username: (defaultUsername ?? '') || '',
      password: generatePassword(30, false),
      saslMechanism: defaultSaslMechanism || 'SCRAM-SHA-256',
      grantTopicPermissions: true,
      specialCharactersEnabled: false,
      passwordLength: 30,
      consumerGroup: (defaultConsumerGroup ?? '') || '',
    },
  });
}

function initialUserSelectionType(
  selectionMode: NonNullable<AddUserStepProps['selectionMode']>,
  hasUsers: boolean
): CreatableSelectionType {
  if (selectionMode === 'new') {
    return CreatableSelectionOptions.CREATE;
  }
  if (selectionMode === 'existing') {
    return CreatableSelectionOptions.EXISTING;
  }
  return hasUsers ? CreatableSelectionOptions.EXISTING : CreatableSelectionOptions.CREATE;
}

// The users to pick from, the Existing/New choice, and the existing user the typed name refers to.
function useUserSelection({
  form,
  hideInternal,
  selectionMode,
}: {
  form: UserForm;
  hideInternal: boolean;
  selectionMode: NonNullable<AddUserStepProps['selectionMode']>;
}) {
  const { data: usersList } = useListUsersQuery(undefined, {
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
    refetchOnWindowFocus: false,
  });
  const watchedUsername = useWatch({
    control: form.control,
    name: 'username',
  });

  const existingUserSelected = useMemo(() => {
    // Only check if the CURRENT form username matches an existing user
    // Don't use persisted username to avoid showing existing user state when creating a new one
    if (!watchedUsername) {
      return;
    }
    return usersList?.users?.find((user) => user.name === watchedUsername);
  }, [watchedUsername, usersList?.users]);

  const userOptions = useMemo(
    () =>
      (usersList?.users ?? [])
        .filter((user) => !(hideInternal && user.name?.startsWith('__')))
        .map((user) => ({
          value: user.name || '',
          label: user.name || '',
        })),
    [usersList, hideInternal]
  );

  const [userSelectionType, setUserSelectionType] = useState<CreatableSelectionType>(() =>
    initialUserSelectionType(selectionMode, userOptions.length > 0)
  );

  const handleUserSelectionTypeChange = useCallback(
    (value: string) => {
      if (value !== CreatableSelectionOptions.EXISTING && value !== CreatableSelectionOptions.CREATE) {
        return;
      }
      setUserSelectionType(value);

      form.setValue('username', '', { shouldDirty: true });
    },
    [form]
  );

  const isReadOnly = Boolean(existingUserSelected) || userSelectionType === CreatableSelectionOptions.EXISTING;
  return {
    watchedUsername,
    existingUserSelected,
    userOptions,
    userSelectionType,
    handleUserSelectionTypeChange,
    isReadOnly,
  };
}

export type UserSelection = ReturnType<typeof useUserSelection>;

function useTopicGrant({
  existingUserSelected,
  topicName,
  topicAccess,
}: {
  existingUserSelected?: User;
  topicName?: string;
  topicAccess: TopicAccess;
}) {
  const { data: aclData } = useListACLsQuery(
    {
      filter: {
        resourceType: ACL_ResourceType.TOPIC,
        resourceName: topicName,
        // Also returns the prefixed and wildcard ACLs that cover the topic.
        resourcePatternType: ACL_ResourcePatternType.MATCH,
      },
    },
    {
      enabled: Boolean(existingUserSelected && topicName),
      staleTime: LONG_LIVED_CACHE_STALE_TIME,
    }
  );

  const userTopicPermissions = useMemo(() => {
    if (
      !(
        existingUserSelected &&
        topicName !== null &&
        topicName !== undefined &&
        topicName !== '' &&
        aclData?.aclResources
      )
    ) {
      return null;
    }

    return checkUserHasTopicPermissions(aclData.aclResources, topicName, existingUserSelected.name, topicAccess);
  }, [existingUserSelected, topicName, aclData, topicAccess]);

  // An existing user is granted the topic only if they lack access, which is assumed until their ACLs load.
  const needsTopicGrant =
    Boolean(topicName) && !(existingUserSelected && userTopicPermissions?.missingPermissions.length === 0);
  return { userTopicPermissions, needsTopicGrant };
}

function useConsumerGroupAccess({
  form,
  showConsumerGroupFields,
  existingUserSelected,
}: {
  form: UserForm;
  showConsumerGroupFields: boolean;
  existingUserSelected?: User;
}) {
  const { data: consumerGroupACLData } = useListACLsQuery(
    {
      filter: {
        resourceType: ACL_ResourceType.GROUP,
      },
    },
    {
      enabled: showConsumerGroupFields,
      staleTime: LONG_LIVED_CACHE_STALE_TIME,
    }
  );
  const watchedConsumerGroup = useWatch({
    control: form.control,
    name: 'consumerGroup',
  });

  const userConsumerGroupPermissions = useMemo(() => {
    if (
      !(
        showConsumerGroupFields &&
        existingUserSelected &&
        watchedConsumerGroup !== null &&
        watchedConsumerGroup !== undefined &&
        watchedConsumerGroup !== '' &&
        consumerGroupACLData?.aclResources
      )
    ) {
      return null;
    }

    return checkUserHasConsumerGroupPermissions(
      consumerGroupACLData.aclResources,
      watchedConsumerGroup,
      existingUserSelected.name
    );
  }, [showConsumerGroupFields, existingUserSelected, watchedConsumerGroup, consumerGroupACLData]);
  return { watchedConsumerGroup, userConsumerGroupPermissions };
}

// The pipeline reads a user's credentials from secrets, which only exist for users created here.
function useMissingUserSecrets(existingUserSelected?: User) {
  const { data: secretsData } = useListSecretsQuery({}, { enabled: Boolean(existingUserSelected) });
  return useMemo(() => {
    if (!(existingUserSelected && secretsData)) {
      return [];
    }
    const stored = new Set(secretsData.secrets.map((secret) => secret.id));
    return Object.values(userSecretIds(existingUserSelected.name)).filter((id) => !stored.has(id));
  }, [existingUserSelected, secretsData]);
}

// What an existing user can already do, and what the pipeline still needs to give them.
function useExistingUserAccess({
  form,
  existingUserSelected,
  topicName,
  topicAccess,
  showConsumerGroupFields,
}: {
  form: UserForm;
  existingUserSelected?: User;
  topicName?: string;
  topicAccess: TopicAccess;
  showConsumerGroupFields: boolean;
}) {
  const topicGrant = useTopicGrant({ existingUserSelected, topicName, topicAccess });
  const consumerGroup = useConsumerGroupAccess({ form, showConsumerGroupFields, existingUserSelected });
  const missingUserSecrets = useMissingUserSecrets(existingUserSelected);
  return { ...topicGrant, ...consumerGroup, missingUserSecrets };
}

export type ExistingUserAccess = ReturnType<typeof useExistingUserAccess>;

function useServiceAccountDraft({
  defaultServiceAccountName,
  pipelineName,
  topicName,
}: Pick<AddUserStepProps, 'defaultServiceAccountName' | 'pipelineName' | 'topicName'>) {
  const [serviceAccountName, setServiceAccountName] = useState<string>(
    (defaultServiceAccountName ?? '') ||
      generateServiceAccountName((pipelineName ?? '') || (topicName ?? '') || 'pipeline', 'pipeline')
  );
  const serviceAccountSelectorRef = useRef<ServiceAccountSelectorRef>(null);
  const [isServiceAccountPending, setIsServiceAccountPending] = useState(false);
  return {
    serviceAccountName,
    setServiceAccountName,
    serviceAccountSelectorRef,
    isServiceAccountPending,
    setIsServiceAccountPending,
  };
}

export type ServiceAccountDraft = ReturnType<typeof useServiceAccountDraft>;

function useReportStepValidity({
  authMethod,
  hasServiceAccount,
  serviceAccountName,
  isServiceAccountPending,
  isFormValid,
  onValidityChange,
}: {
  authMethod: AuthenticationMethodType;
  hasServiceAccount: boolean;
  serviceAccountName: string;
  isServiceAccountPending: boolean;
  isFormValid: boolean;
  onValidityChange?: (isValid: boolean) => void;
}) {
  useEffect(
    function reportValidity() {
      const isValid =
        authMethod === AuthenticationMethod.SERVICE_ACCOUNT
          ? hasServiceAccount ||
            Boolean(serviceAccountName && serviceAccountName.trim().length > 0 && !isServiceAccountPending)
          : isFormValid;
      onValidityChange?.(isValid);
    },
    [authMethod, hasServiceAccount, serviceAccountName, isServiceAccountPending, isFormValid, onValidityChange]
  );
}

// ── Submission ─────────────────────────────────────────────────────────────────

function invalidateUserQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: listUsers,
        cardinality: 'infinite',
      }),
    }),
    queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: listACLs,
        cardinality: 'finite',
      }),
    }),
    queryClient.invalidateQueries({
      queryKey: ['consumer-groups'],
    }),
  ]);
}

async function createPipelineServiceAccount(
  selector: ServiceAccountSelectorRef,
  serviceAccountLabel: string,
  serviceAccountName: string
): Promise<UserStepSubmissionResult> {
  try {
    const result = await selector.createServiceAccount(serviceAccountLabel);

    if (!result) {
      return { success: false };
    }

    const submissionData: ServiceAccountSubmissionData = {
      authMethod: AuthenticationMethod.SERVICE_ACCOUNT,
      serviceAccountName,
      serviceAccountId: result.serviceAccountId,
      serviceAccountSecretName: result.secretName,
    };

    return {
      success: true,
      data: submissionData,
    };
  } catch (createServiceAccountError) {
    const error = ConnectError.from(createServiceAccountError);
    toast.error(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'service account' }));
    return { success: false };
  }
}

function submitServiceAccount({
  hasServiceAccount,
  selector,
  serviceAccountLabel,
  serviceAccountName,
}: {
  hasServiceAccount: boolean;
  selector: ServiceAccountSelectorRef | null;
  serviceAccountLabel: string;
  serviceAccountName: string;
}): Promise<UserStepSubmissionResult> {
  if (hasServiceAccount) {
    return Promise.resolve({
      success: true,
      data: { authMethod: AuthenticationMethod.SERVICE_ACCOUNT, existing: true },
    });
  }
  if (!selector) {
    toast.error('Service account selector not initialized');
    return Promise.resolve({ success: false });
  }
  return createPipelineServiceAccount(selector, serviceAccountLabel, serviceAccountName);
}

function useAddUserSubmit({
  form,
  authMethod,
  hasServiceAccount,
  serviceAccount,
  pipelineName,
  topicName,
  needsTopicGrant,
  createUserWithSecrets,
  existingUserSelected,
  showConsumerGroupFields,
}: {
  form: UserForm;
  authMethod: AuthenticationMethodType;
  hasServiceAccount: boolean;
  serviceAccount: ServiceAccountDraft;
  pipelineName?: string;
  topicName?: string;
  needsTopicGrant: boolean;
  createUserWithSecrets: ReturnType<typeof useCreateUserWithSecretsMutation>['createUserWithSecrets'];
  existingUserSelected?: User;
  showConsumerGroupFields: boolean;
}) {
  const queryClient = useQueryClient();
  const { serviceAccountName, serviceAccountSelectorRef } = serviceAccount;

  return useCallback<SubmitUser>(
    async (userData) => {
      if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
        return submitServiceAccount({
          hasServiceAccount,
          selector: serviceAccountSelectorRef.current,
          serviceAccountLabel: (pipelineName ?? '') || (topicName ?? '') || 'pipeline',
          serviceAccountName,
        });
      }

      // An existing user logs in with the mechanism it was created with; the form only asks for a new one's.
      const existingMechanism = saslMechanismFromProto(existingUserSelected?.mechanism);
      const result = await createUserWithSecrets({
        userData: existingMechanism ? { ...userData, saslMechanism: existingMechanism } : userData,
        topicName: needsTopicGrant ? topicName : undefined,
        consumerGroup: showConsumerGroupFields ? form.getValues('consumerGroup') : undefined,
        existingUserSelected: Boolean(existingUserSelected),
      });

      if (result.success) {
        await invalidateUserQueries(queryClient);
      }

      return result;
    },
    [
      authMethod,
      hasServiceAccount,
      serviceAccountName,
      serviceAccountSelectorRef,
      pipelineName,
      topicName,
      needsTopicGrant,
      createUserWithSecrets,
      existingUserSelected,
      showConsumerGroupFields,
      form,
      queryClient,
    ]
  );
}

// A service account needs no form validation; a SASL user is submitted only once the form is valid.
async function triggerUserStepSubmit({
  form,
  authMethod,
  submit,
  signal,
}: {
  form: UserForm;
  authMethod: AuthenticationMethodType;
  submit: SubmitUser;
  signal?: AbortSignal;
}): Promise<UserStepSubmissionResult> {
  if (signal?.aborted ?? false) {
    return { success: false };
  }
  if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
    return submit(form.getValues());
  }
  const isUserFormValid = await form.trigger();
  if (signal?.aborted ?? false) {
    return { success: false };
  }
  if (isUserFormValid) {
    return submit(form.getValues());
  }
  return {
    success: false,
  };
}

// ── Form sections ──────────────────────────────────────────────────────────────

// ── Step ───────────────────────────────────────────────────────────────────────

export function AddUserStep({
  defaultUsername,
  defaultSaslMechanism,
  hideInternal = true,
  topicName,
  topicAccess = 'read-write',
  defaultConsumerGroup,
  showConsumerGroupFields = false,
  onValidityChange,
  defaultAuthMethod,
  defaultServiceAccountName,
  hasServiceAccount = false,
  pipelineName,
  selectionMode = 'both',
  hideTitle,
  className,
  inline = false,
  ref,
}: AddUserStepProps & MotionProps & { ref?: Ref<UserStepRef> }) {
  const form = useAddUserForm({ defaultUsername, defaultSaslMechanism, defaultConsumerGroup });
  const users = useUserSelection({ form, hideInternal, selectionMode });
  const access = useExistingUserAccess({
    form,
    existingUserSelected: users.existingUserSelected,
    topicName,
    topicAccess,
    showConsumerGroupFields,
  });
  const { createUserWithSecrets, isPending } = useCreateUserWithSecretsMutation();
  const [authMethod, setAuthMethod] = useState<AuthenticationMethodType>(
    defaultAuthMethod || AuthenticationMethod.SASL
  );
  const serviceAccount = useServiceAccountDraft({ defaultServiceAccountName, pipelineName, topicName });

  useReportStepValidity({
    authMethod,
    hasServiceAccount,
    serviceAccountName: serviceAccount.serviceAccountName,
    isServiceAccountPending: serviceAccount.isServiceAccountPending,
    isFormValid: form.formState.isValid,
    onValidityChange,
  });

  const handleSubmit = useAddUserSubmit({
    form,
    authMethod,
    hasServiceAccount,
    serviceAccount,
    pipelineName,
    topicName,
    needsTopicGrant: access.needsTopicGrant,
    createUserWithSecrets,
    existingUserSelected: users.existingUserSelected,
    showConsumerGroupFields,
  });

  useImperativeHandle(ref, () => ({
    triggerSubmit: (signal?: AbortSignal) => triggerUserStepSubmit({ form, authMethod, submit: handleSubmit, signal }),
    isPending: isPending || serviceAccount.isServiceAccountPending,
  }));

  return (
    <StepSurface
      className={className}
      description="Select or create a SASL-SCRAM user that can interact with this topic."
      hideTitle={hideTitle}
      inline={inline}
      title="Configure a user with permissions"
    >
      <AddUserFormBody
        access={access}
        authMethod={authMethod}
        form={form}
        hasServiceAccount={hasServiceAccount}
        inline={inline}
        isPending={isPending}
        onAuthMethodChange={setAuthMethod}
        selectionMode={selectionMode}
        serviceAccount={serviceAccount}
        showConsumerGroupFields={showConsumerGroupFields}
        topicName={topicName}
        users={users}
      />
    </StepSurface>
  );
}
