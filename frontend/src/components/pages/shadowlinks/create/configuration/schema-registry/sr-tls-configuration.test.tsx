/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { Form } from 'components/redpanda-ui/components/form';
import { isEmbedded } from 'config';
import { useForm } from 'react-hook-form';
import { render, screen, waitFor } from 'test-utils';
import { vi } from 'vitest';

import { SrTlsConfiguration } from './sr-tls-configuration';
import { FormSchema, type FormValues, initialValues, SCHEMA_REGISTRY_MODE } from '../../model';

vi.mock('config', () => ({
  isEmbedded: vi.fn(() => false),
  isFeatureFlagEnabled: vi.fn(() => false),
}));

let mockSecretsData: { secrets: { id: string }[] } | undefined;
vi.mock('react-query/api/secret', () => ({
  useCreateSecretMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListSecretsQuery: () => ({ data: mockSecretsData }),
}));

const apiModeValues = (schemaRegistry: Partial<FormValues['schemaRegistry']> = {}): FormValues => ({
  ...structuredClone(initialValues),
  schemaRegistry: {
    ...structuredClone(initialValues.schemaRegistry),
    mode: SCHEMA_REGISTRY_MODE.API,
    sourceUrl: 'https://sr.example.com',
    ...schemaRegistry,
  },
});

const TestWrapper = ({
  defaultValues,
  onFormChange,
}: {
  defaultValues: FormValues;
  onFormChange?: (values: FormValues) => void;
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  if (onFormChange) {
    form.watch((values) => {
      onFormChange(values as FormValues);
    });
  }

  return (
    <Form {...form}>
      <form>
        <SrTlsConfiguration />
      </form>
    </Form>
  );
};

describe('SrTlsConfiguration', () => {
  test('shows a generic label for a hydrated certificate without a file name', () => {
    render(
      <TestWrapper
        defaultValues={apiModeValues({
          mtls: {
            ...initialValues.schemaRegistry.mtls,
            ca: { pemContent: 'CA_PEM', fileName: '' },
          },
        })}
      />
    );

    expect(screen.getByTestId('sr-ca-status')).toBeInTheDocument();
    expect(screen.getByText('Configured certificate')).toBeInTheDocument();
  });

  test('shows the kept server-side key with its fingerprint and removes it', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        defaultValues={apiModeValues({
          mtls: {
            ...initialValues.schemaRegistry.mtls,
            clientCert: { pemContent: 'CERT_PEM', fileName: '' },
            existingKeyConfigured: true,
            existingKeyFingerprint: 'abc123=',
          },
        })}
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    // Hydrated pair opens the mTLS disclosure and shows the configured badge.
    expect(screen.getByTestId('sr-clientKey-existing-status')).toBeInTheDocument();
    expect(screen.getByTestId('sr-existing-key-fingerprint')).toHaveTextContent('SHA-256: abc123=');

    await user.click(screen.getByTestId('remove-sr-existing-key-button'));

    await waitFor(() => {
      expect(formValues?.schemaRegistry.mtls.existingKeyConfigured).toBe(false);
    });
    // The dropzone replaces the configured row so a new key can be uploaded.
    expect(screen.queryByTestId('sr-clientKey-existing-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('add-sr-clientKey-button')).toBeInTheDocument();
    // With the cert still present, the pair rule now demands a new key.
    await waitFor(() => {
      expect(screen.getByTestId('sr-mtls-client-key-error')).toHaveTextContent(
        'Client private key is required when client certificate is provided'
      );
    });
  });

  test('an uploaded key takes precedence over the kept-key row', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        defaultValues={apiModeValues({
          mtls: {
            ...initialValues.schemaRegistry.mtls,
            clientCert: { pemContent: 'CERT_PEM', fileName: '' },
            clientKey: { pemContent: 'NEW_KEY_PEM', fileName: 'client.key' },
            existingKeyConfigured: true,
            existingKeyFingerprint: 'abc123=',
          },
        })}
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    expect(screen.queryByTestId('sr-clientKey-existing-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('sr-clientKey-status')).toBeInTheDocument();
    expect(screen.getByText('client.key')).toBeInTheDocument();

    // Removing the upload falls back to the kept server-side key.
    await user.click(screen.getByTestId('remove-sr-clientKey-button'));

    await waitFor(() => {
      expect(formValues?.schemaRegistry.mtls.clientKey).toBeUndefined();
    });
    expect(screen.getByTestId('sr-clientKey-existing-status')).toBeInTheDocument();
  });

  describe('client key in embedded mode (Cloud)', () => {
    beforeEach(() => {
      vi.mocked(isEmbedded).mockReturnValue(true);
      mockSecretsData = { secrets: [{ id: 'SR_MTLS_CLIENT_KEY' }] };
    });

    afterEach(() => {
      vi.mocked(isEmbedded).mockReturnValue(false);
      mockSecretsData = undefined;
    });

    test('replaces the key dropzone with a secret selector and stores a secret reference', async () => {
      const user = userEvent.setup();
      let formValues: FormValues | undefined;

      render(
        <TestWrapper
          defaultValues={apiModeValues()}
          onFormChange={(values) => {
            formValues = values;
          }}
        />
      );

      await user.click(screen.getByTestId('sr-tls-mtls-disclosure-trigger'));

      await waitFor(() => {
        expect(screen.getByText('Client private key secret')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('add-sr-clientKey-button')).not.toBeInTheDocument();
      // The client certificate stays a PEM upload; only the key is a secret.
      expect(screen.getByTestId('add-sr-clientCert-button')).toBeInTheDocument();

      // Queried by accessible name: form wiring must reach the trigger.
      await user.click(screen.getByRole('combobox', { name: /client private key secret/i }));
      await user.click(await screen.findByRole('option', { name: 'SR_MTLS_CLIENT_KEY' }));

      await waitFor(() => {
        expect(formValues?.schemaRegistry.mtls.clientKey).toEqual({
          pemContent: '${secrets.SR_MTLS_CLIENT_KEY}',
          fileName: '',
        });
      });
    });

    test('kept server-side key still wins; removing it reveals the secret selector', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper
          defaultValues={apiModeValues({
            mtls: {
              ...initialValues.schemaRegistry.mtls,
              clientCert: { pemContent: 'CERT_PEM', fileName: '' },
              existingKeyConfigured: true,
              existingKeyFingerprint: 'abc123=',
            },
          })}
        />
      );

      expect(screen.getByTestId('sr-clientKey-existing-status')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('remove-sr-existing-key-button'));

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('add-sr-clientKey-button')).not.toBeInTheDocument();
    });
  });

  test('renders file-path TLS settings read-only and hides the upload disclosures', () => {
    render(
      <TestWrapper
        defaultValues={apiModeValues({
          mtls: {
            ...initialValues.schemaRegistry.mtls,
            filePaths: { caPath: '/etc/tls/ca.pem', keyPath: '/etc/tls/client.key', certPath: '/etc/tls/client.pem' },
          },
        })}
      />
    );

    expect(screen.getByTestId('sr-tls-file-settings-readonly')).toBeInTheDocument();
    expect(screen.getByTestId('sr-tls-file-ca-path')).toHaveTextContent('/etc/tls/ca.pem');
    expect(screen.getByTestId('sr-tls-file-key-path')).toHaveTextContent('/etc/tls/client.key');
    expect(screen.getByTestId('sr-tls-file-cert-path')).toHaveTextContent('/etc/tls/client.pem');
    expect(screen.queryByTestId('sr-mtls-certificates-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sr-tls-ca-disclosure')).not.toBeInTheDocument();
  });
});
