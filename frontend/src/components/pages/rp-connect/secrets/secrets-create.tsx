import { create } from '@bufbuild/protobuf';
import { Button } from 'components/redpanda-ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { useState } from 'react';

import { CreateSecretRequestSchema, Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../../state/app-global';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../../state/backend-api';
import { showToast } from '../../../../utils/toast.utils';
import { DefaultSkeleton } from '../../../../utils/tsx-utils';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import PageContent from '../../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../../page';
import { formatPipelineError } from '../errors';

const returnToListTab = '/connect-clusters?defaultTab=redpanda-connect-secret';
const SECRET_NAME_VALIDATION_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;
const SECRET_NAME_MAX_LENGTH = 255;

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

  const nameError = (() => {
    if ((rpcnSecretManagerApi.secrets ?? []).some((x) => x.id === id)) {
      return 'Secret name is already in use';
    }
    if (id === '') {
      return '';
    }
    if (!SECRET_NAME_VALIDATION_REGEX.test(id)) {
      return 'The name you entered is invalid. It must start with an letter (A–Z) and can only contain letters (A–Z), digits (0–9), and underscores (_).';
    }
    if (id.length > SECRET_NAME_MAX_LENGTH) {
      return 'The secret name must be fewer than 255 characters.';
    }
    return '';
  })();

  const cancel = () => {
    setSecret('');
    setId('');
    appGlobal.historyPush(returnToListTab);
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
        showToast({
          status: 'success',
          duration: 4000,
          title: 'Secret created',
        });
        pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(returnToListTab);
      })
      .catch((err) => {
        showToast({
          status: 'error',
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
  const hasNameError = Boolean(nameError);

  return (
    <PageContent>
      <div className="flex flex-col gap-5">
        <Field data-invalid={hasNameError}>
          <FieldLabel htmlFor="secretId" required>
            Secret name
          </FieldLabel>
          <Input
            className="w-[500px]"
            disabled={isCreating}
            id="secretId"
            max={SECRET_NAME_MAX_LENGTH}
            min={1}
            onChange={(x) => {
              setId(x.target.value);
            }}
            pattern="^[A-Z][A-Z0-9_]*$"
            placeholder="Enter a secret name..."
            required
            testId="secretId"
            value={id}
          />
          <FieldDescription>This secret name will be stored in upper case.</FieldDescription>
          {hasNameError ? <FieldError errors={[{ message: nameError }]} /> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="secretValue" required>
            Secret value
          </FieldLabel>
          <Input
            className="w-[500px]"
            disabled={isCreating}
            id="secretValue"
            onChange={(x) => {
              setSecret(x.target.value);
            }}
            placeholder="Enter a secret value..."
            required
            testId="secretValue"
            type="password"
            value={secret}
          />
        </Field>

        {/* The Registry ButtonGroup attaches its children, where Chakra's spaced them. */}
        <div className="flex gap-2">
          <Button
            // `isLoading` hides the label, so the button needs its own name.
            aria-label="Create secret"
            disabled={isIdEmpty || isSecretEmpty || hasNameError}
            isLoading={isCreating}
            onClick={createSecret}
            testId="submit-create-rpcn-secret"
          >
            Create secret
          </Button>
          <Button disabled={isCreating} onClick={cancel} testId="cancel-create-rpcn-secret" variant="link">
            Cancel
          </Button>
        </div>
      </div>
    </PageContent>
  );
};

export default RpConnectSecretCreate;
