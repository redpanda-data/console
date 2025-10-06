import { create } from '@bufbuild/protobuf';
import { Button, ButtonGroup, createStandaloneToast, Flex, FormField, Input, PasswordInput } from '@redpanda-data/ui';
import { action, computed, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';

import { CreateSecretRequestSchema, Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../../state/appGlobal';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../../state/backendApi';
import { DefaultSkeleton } from '../../../../utils/tsxUtils';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import PageContent from '../../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../../Page';
import { formatPipelineError } from '../errors';

const { ToastContainer, toast } = createStandaloneToast();

const returnSecretTab = '/connect-clusters?defaultTab=redpanda-connect-secret';
const SECRET_NAME_VALIDATION_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;

@observer
class RpConnectSecretCreate extends PageComponent {
  @observable id = '';
  @observable secret = '';
  @observable isCreating = false;

  constructor(p: any) {
    super(p);
    makeObservable(this, undefined, { autoBind: true });
  }

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

  cancel() {
    this.secret = '';
    this.id = '';
    appGlobal.historyPush(returnSecretTab);
  }

  async createSecret() {
    this.isCreating = true;
    this.id = this.id.toUpperCase();
    rpcnSecretManagerApi
      .create(
        create(CreateSecretRequestSchema, {
          id: this.id,
          secretData: base64ToUInt8Array(encodeBase64(this.secret)),
          scopes: [Scope.REDPANDA_CONNECT],
        })
      )
      .then(async () => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: 'Secret created',
        });
        await pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(returnSecretTab);
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
        this.isCreating = false;
      });
  }

  @computed
  get isNameValid() {
    if ((rpcnSecretManagerApi.secrets || []).any((x) => x.id === this.id)) {
      return 'Secret name is already in use';
    }
    if (this.id === '') {
      return '';
    }
    if (!SECRET_NAME_VALIDATION_REGEX.test(this.id)) {
      return 'The name you entered is invalid. It must start with an letter (A–Z) and can only contain letters (A–Z), digits (0–9), and underscores (_).';
    }
    if (this.id.length > 255) {
      return 'The secret name must be fewer than 255 characters.';
    }
    return '';
  }

  render() {
    if (!rpcnSecretManagerApi.secrets) return DefaultSkeleton;

    const isIdEmpty = this.id.trim().length === 0;
    const isSecretEmpty = this.secret.trim().length === 0;

    return (
      <PageContent>
        <ToastContainer />
        <Flex flexDirection="column" gap={5}>
          <FormField
            description={'This secret name will be stored in upper case.'}
            errorText={this.isNameValid}
            isInvalid={Boolean(this.isNameValid)}
            label="Secret name"
          >
            <Flex alignItems="center" gap="2">
              <Input
                data-testid="secretId"
                disabled={this.isCreating}
                isRequired
                max={255}
                min={1}
                onChange={(x) => (this.id = x.target.value)}
                pattern="^[A-Z][A-Z0-9_]*$"
                placeholder="Enter a secret name..."
                value={this.id}
                width={500}
              />
            </Flex>
          </FormField>

          <FormField label="Secret value">
            <Flex alignItems="center" width={500}>
              <PasswordInput
                data-testid="secretValue"
                isDisabled={this.isCreating}
                isRequired
                onChange={(x) => (this.secret = x.target.value)}
                placeholder="Enter a secret value..."
                type="password"
                value={this.secret}
                width={500}
              />
            </Flex>
          </FormField>

          <ButtonGroup>
            <Button
              data-testid={'submit-create-rpcn-secret'}
              isDisabled={isIdEmpty || isSecretEmpty || Boolean(this.isNameValid)}
              isLoading={this.isCreating}
              onClick={action(() => this.createSecret())}
            >
              Create secret
            </Button>
            <Button
              data-testid={'cancel-create-rpcn-secret'}
              disabled={this.isCreating}
              onClick={action(() => this.cancel())}
              variant="link"
            >
              Cancel
            </Button>
          </ButtonGroup>
        </Flex>
      </PageContent>
    );
  }
}

export default RpConnectSecretCreate;
