import { Button, ButtonGroup, Flex, FormField, Input, PasswordInput, createStandaloneToast } from '@redpanda-data/ui';
import { action, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Scope, UpdateSecretRequest } from '../../../../protogen/redpanda/api/dataplane/v1alpha2/secret_pb';
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
    appGlobal.history.push(returnSecretTab);
  }

  async updateSecret() {
    this.isUpdating = true;

    rpcnSecretManagerApi
      .update(
        this.props.secretId,
        new UpdateSecretRequest({
          id: this.props.secretId,
          // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
          secretData: base64ToUInt8Array(encodeBase64(this.secret)),
          scopes: [Scope.REDPANDA_CONNECT],
        }),
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
        appGlobal.history.push(returnSecretTab);
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
                placeholder="Enter a secret name..."
                data-testid="secretId"
                pattern="^[A-Z][A-Z0-9_]*$"
                isRequired
                disabled={true}
                value={this.props.secretId}
                width={500}
              />
            </Flex>
          </FormField>

          <FormField label="Secret value">
            <Flex alignItems="center" gap="2" width={500}>
              <PasswordInput
                placeholder="Enter a new secret value..."
                data-testid="secretValue"
                isRequired
                value={this.secret}
                onChange={(x) => (this.secret = x.target.value)}
                width={500}
                type="password"
                isDisabled={this.isUpdating}
              />
            </Flex>
          </FormField>

          <ButtonGroup>
            <Button
              isLoading={this.isUpdating}
              data-testid="submit-update-secret"
              isDisabled={isSecretEmpty}
              onClick={action(() => this.updateSecret())}
            >
              Update secret
            </Button>
            <Button variant="link" disabled={this.isUpdating} onClick={action(() => this.cancel())}>
              Cancel
            </Button>
          </ButtonGroup>
        </Flex>
      </PageContent>
    );
  }
}

export default RpConnectSecretUpdate;
