import { create } from '@bufbuild/protobuf';
import { Button, ButtonGroup, createStandaloneToast, Flex, FormField, Input, PasswordInput } from '@redpanda-data/ui';
import { action, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';

import { Scope, UpdateSecretRequestSchema } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../../state/appGlobal';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../../state/backendApi';
import { DefaultSkeleton } from '../../../../utils/tsxUtils';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import PageContent from '../../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../../Page';
import { formatPipelineError } from '../errors';

const { ToastContainer, toast } = createStandaloneToast();

const returnSecretTab = '/connect-clusters?defaultTab=redpanda-connect-secret';

@observer
class RpConnectSecretUpdate extends PageComponent<{ secretId: string }> {
  @observable secret = '';
  @observable isUpdating = false;

  constructor(p: any) {
    super(p);
    makeObservable(this, undefined, { autoBind: true });
  }

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

  cancel() {
    this.secret = '';
    appGlobal.historyPush(returnSecretTab);
  }

  async updateSecret() {
    this.isUpdating = true;

    rpcnSecretManagerApi
      .update(
        this.props.secretId,
        create(UpdateSecretRequestSchema, {
          id: this.props.secretId,
          secretData: base64ToUInt8Array(encodeBase64(this.secret)),
          scopes: [Scope.REDPANDA_CONNECT],
        })
      )
      .then(async () => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: 'Secret updated',
          id: 'secret-update-success',
        });
        await pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(returnSecretTab);
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
        this.isUpdating = false;
      });
  }

  render() {
    if (!rpcnSecretManagerApi.secrets) return DefaultSkeleton;

    const isSecretEmpty = this.secret.trim().length === 0;

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
                value={this.props.secretId}
                width={500}
              />
            </Flex>
          </FormField>

          <FormField label="Secret value">
            <Flex alignItems="center" gap="2" width={500}>
              <PasswordInput
                data-testid="secretValue"
                isDisabled={this.isUpdating}
                isRequired
                onChange={(x) => (this.secret = x.target.value)}
                placeholder="Enter a new secret value..."
                type="password"
                value={this.secret}
                width={500}
              />
            </Flex>
          </FormField>

          <ButtonGroup>
            <Button
              data-testid="submit-update-secret"
              isDisabled={isSecretEmpty}
              isLoading={this.isUpdating}
              onClick={action(() => this.updateSecret())}
            >
              Update secret
            </Button>
            <Button disabled={this.isUpdating} onClick={action(() => this.cancel())} variant="link">
              Cancel
            </Button>
          </ButtonGroup>
        </Flex>
      </PageContent>
    );
  }
}

export default RpConnectSecretUpdate;
