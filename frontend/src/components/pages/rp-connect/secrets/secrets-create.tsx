import { create } from '@bufbuild/protobuf';
import { Button, ButtonGroup, createStandaloneToast, Flex, FormField, Input, PasswordInput } from '@redpanda-data/ui';
import { useState } from 'react';

import { CreateSecretRequestSchema, Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../../state/app-global';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../../state/backend-api';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import PageContent from '../../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../../page';
import { formatPipelineError } from '../errors';

const { ToastContainer, toast } = createStandaloneToast();

const returnToSecretsTab = '/connect-clusters?defaultTab=redpanda-connect-secret';
const SECRET_NAME_VALIDATION_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;

class RpConnectSecretCreate extends PageComponent {
  initPage(p: PageInitHelper) {
    p.title = 'Create secret';
    p.addBreadcrumb('Redpanda Connect Secret Manager', '/rp-connect/secrets/create');
    p.addBreadcrumb('Create secret', '');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    rpcnSecretManagerApi.refreshSecrets(force);
  }

  render() {
    if (!rpcnSecretManagerApi.secrets) {
      return DefaultSkeleton;
    }
    return <RpConnectSecretCreateContent />;
  }
}

const RpConnectSecretCreateContent = () => {
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const isNameValid = (() => {
    if ((rpcnSecretManagerApi.secrets ?? []).some((x) => x.id === id)) {
      return 'Secret name is already in use';
    }
    if (id === '') {
      return '';
    }
    if (!SECRET_NAME_VALIDATION_REGEX.test(id)) {
      return 'The name you entered is invalid. It must start with an letter (A–Z) and can only contain letters (A–Z), digits (0–9), and underscores (_).';
    }
    if (id.length > 255) {
      return 'The secret name must be fewer than 255 characters.';
    }
    return '';
  })();

  const cancel = () => {
    setSecret('');
    setId('');
    appGlobal.historyPush(returnToSecretsTab);
  };

  const createSecret = () => {
    setIsCreating(true);
    const uppercasedId = id.toUpperCase();
    setId(uppercasedId);
    rpcnSecretManagerApi
      .create(
        create(CreateSecretRequestSchema, {
          id: uppercasedId,
          secretData: base64ToUInt8Array(encodeBase64(secret)),
          scopes: [Scope.REDPANDA_CONNECT],
        })
      )
      .then(() => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: 'Secret created',
        });
        pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(returnToSecretsTab);
      })
      .catch((err) => {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to create secret',
          description: formatPipelineError(err),
        });
      })
      .finally(() => {
        setIsCreating(false);
      });
  };

  const isIdEmpty = id.trim().length === 0;
  const isSecretEmpty = secret.trim().length === 0;

  return (
    <PageContent>
      <ToastContainer />
      <Flex flexDirection="column" gap={5}>
        <FormField
          description={'This secret name will be stored in upper case.'}
          errorText={isNameValid}
          isInvalid={Boolean(isNameValid)}
          label="Secret name"
        >
          <Flex alignItems="center" gap="2">
            <Input
              data-testid="secretId"
              disabled={isCreating}
              isRequired
              max={255}
              min={1}
              onChange={(x) => {
                setId(x.target.value);
              }}
              pattern="^[A-Z][A-Z0-9_]*$"
              placeholder="Enter a secret name..."
              value={id}
              width={500}
            />
          </Flex>
        </FormField>

        <FormField label="Secret value">
          <Flex alignItems="center" width={500}>
            <PasswordInput
              data-testid="secretValue"
              isDisabled={isCreating}
              isRequired
              onChange={(x) => {
                setSecret(x.target.value);
              }}
              placeholder="Enter a secret value..."
              type="password"
              value={secret}
              width={500}
            />
          </Flex>
        </FormField>

        <ButtonGroup>
          <Button
            data-testid={'submit-create-rpcn-secret'}
            isDisabled={isIdEmpty || isSecretEmpty || Boolean(isNameValid)}
            isLoading={isCreating}
            onClick={createSecret}
          >
            Create secret
          </Button>
          <Button data-testid={'cancel-create-rpcn-secret'} disabled={isCreating} onClick={cancel} variant="link">
            Cancel
          </Button>
        </ButtonGroup>
      </Flex>
    </PageContent>
  );
};

export default RpConnectSecretCreate;
