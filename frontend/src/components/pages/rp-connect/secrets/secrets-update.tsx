import { create } from '@bufbuild/protobuf';
import { Button } from 'components/redpanda-ui/components/button';
import { Field, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { useState } from 'react';

import { Scope, UpdateSecretRequestSchema } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../../state/app-global';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../../state/backend-api';
import { showToast } from '../../../../utils/toast.utils';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import PageContent from '../../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../../page';
import { formatPipelineError } from '../errors';

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
        showToast({
          status: 'success',
          duration: 4000,
          title: 'Secret updated',
          id: 'secret-update-success',
        });
        pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(returnToListTab);
      })
      .catch((err) => {
        showToast({
          status: 'error',
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
      <div className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="secretId" required>
            Secret name
          </FieldLabel>
          <Input
            className="w-[500px]"
            disabled={true}
            id="secretId"
            pattern="^[A-Z][A-Z0-9_]*$"
            placeholder="Enter a secret name..."
            required
            testId="secretId"
            value={secretId}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="secretValue" required>
            Secret value
          </FieldLabel>
          <Input
            className="w-[500px]"
            disabled={isUpdating}
            id="secretValue"
            onChange={(x) => {
              setSecret(x.target.value);
            }}
            placeholder="Enter a new secret value..."
            required
            testId="secretValue"
            type="password"
            value={secret}
          />
        </Field>

        {/* Chakra's ButtonGroup spaced its children; the Registry's attaches them. */}
        <div className="flex gap-2">
          <Button
            // `isLoading` hides the label, so the button needs a name of its own while busy.
            aria-label="Update secret"
            disabled={isSecretEmpty}
            isLoading={isUpdating}
            onClick={updateSecret}
            testId="submit-update-secret"
          >
            Update secret
          </Button>
          <Button disabled={isUpdating} onClick={cancel} variant="link">
            Cancel
          </Button>
        </div>
      </div>
    </PageContent>
  );
};

export default RpConnectSecretUpdate;
