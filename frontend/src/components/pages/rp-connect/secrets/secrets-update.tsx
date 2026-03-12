import { create } from '@bufbuild/protobuf';
import { Button, ButtonGroup, createStandaloneToast, Flex, FormField, Input, PasswordInput } from '@redpanda-data/ui';
import { useState } from 'react';

import { Scope, UpdateSecretRequestSchema } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../../state/app-global';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../../state/backend-api';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import PageContent from '../../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../../page';
import { formatPipelineError } from '../errors';

const { ToastContainer, toast } = createStandaloneToast();

const returnToListTab = '/connect-clusters?defaultTab=redpanda-connect-secret';

class RpConnectSecretUpdate extends PageComponent<{ secretId: string }> {
  initPage(p: PageInitHelper) {
    p.title = 'Update secret';
    p.addBreadcrumb('Redpanda Connect Secret Manager', '/rp-connect/secrets/update');
    p.addBreadcrumb('Update secret', '');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(_force: boolean) {
    rpcnSecretManagerApi.refreshSecrets(_force);
  }

  render() {
    if (!rpcnSecretManagerApi.secrets) {
      return DefaultSkeleton;
    }
    return <RpConnectSecretUpdateContent secretId={this.props.secretId} />;
  }
}

const RpConnectSecretUpdateContent = ({ secretId }: { secretId: string }) => {
  const [secret, setSecret] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const cancel = () => {
    setSecret('');
    appGlobal.historyPush(returnToListTab);
  };

  const updateSecret = () => {
    setIsUpdating(true);

    rpcnSecretManagerApi
      .update(
        secretId,
        create(UpdateSecretRequestSchema, {
          id: secretId,
          secretData: base64ToUInt8Array(encodeBase64(secret)),
          scopes: [Scope.REDPANDA_CONNECT],
        })
      )
      .then(() => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: 'Secret updated',
          id: 'secret-update-success',
        });
        pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(returnToListTab);
      })
      .catch((err) => {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to update secret',
          description: formatPipelineError(err),
        });
      })
      .finally(() => {
        setIsUpdating(false);
      });
  };

  const isSecretEmpty = secret.trim().length === 0;

  return (
    <PageContent>
      <ToastContainer />
      <Flex flexDirection="column" gap={5}>
        <FormField label="Secret name">
          <Flex alignItems="center" gap="2">
            <Input
              data-testid="secretId"
              disabled={true}
              isRequired
              pattern="^[A-Z][A-Z0-9_]*$"
              placeholder="Enter a secret name..."
              value={secretId}
              width={500}
            />
          </Flex>
        </FormField>

        <FormField label="Secret value">
          <Flex alignItems="center" gap="2" width={500}>
            <PasswordInput
              data-testid="secretValue"
              isDisabled={isUpdating}
              isRequired
              onChange={(x) => {
                setSecret(x.target.value);
              }}
              placeholder="Enter a new secret value..."
              type="password"
              value={secret}
              width={500}
            />
          </Flex>
        </FormField>

        <ButtonGroup>
          <Button
            data-testid="submit-update-secret"
            isDisabled={isSecretEmpty}
            isLoading={isUpdating}
            onClick={updateSecret}
          >
            Update secret
          </Button>
          <Button disabled={isUpdating} onClick={cancel} variant="link">
            Cancel
          </Button>
        </ButtonGroup>
      </Flex>
    </PageContent>
  );
};

export default RpConnectSecretUpdate;
