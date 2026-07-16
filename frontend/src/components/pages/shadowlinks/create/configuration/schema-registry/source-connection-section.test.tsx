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
import { useForm } from 'react-hook-form';
import { render, screen, waitFor } from 'test-utils';

import { SourceConnectionSection } from './source-connection-section';
import { FormSchema, type FormValues, initialValues, SCHEMA_REGISTRY_MODE, SR_AUTH_METHOD } from '../../model';

const apiModeValues: FormValues = {
  ...initialValues,
  schemaRegistry: {
    ...initialValues.schemaRegistry,
    mode: SCHEMA_REGISTRY_MODE.API,
  },
};

const TestWrapper = ({
  defaultValues = apiModeValues,
  onFormChange,
}: {
  defaultValues?: FormValues;
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
        <SourceConnectionSection />
      </form>
    </Form>
  );
};

describe('SourceConnectionSection', () => {
  test('should render the source URL field and default to no authentication', () => {
    render(<TestWrapper />);

    expect(screen.getByTestId('sr-source-url-input')).toHaveAttribute(
      'placeholder',
      'https://schema-registry.example.com:8081'
    );
    expect(screen.getByTestId('sr-auth-none-description')).toBeInTheDocument();
    expect(screen.queryByTestId('sr-basic-auth-fields')).not.toBeInTheDocument();
  });

  test('should reveal username and a real password input for HTTP Basic', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    await user.click(screen.getByTestId('sr-auth-basic-tab'));

    await waitFor(() => {
      expect(screen.getByTestId('sr-basic-auth-fields')).toBeInTheDocument();
    });

    const passwordInput = screen.getByTestId('sr-basic-password-input');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.type(screen.getByTestId('sr-basic-username-input'), 'sr-replicator');
    await user.type(passwordInput, 'p@ssw0rd!');

    await waitFor(() => {
      expect(formValues?.schemaRegistry?.authMethod).toBe(SR_AUTH_METHOD.BASIC);
      expect(formValues?.schemaRegistry?.basicCredentials?.username).toBe('sr-replicator');
      expect(formValues?.schemaRegistry?.basicCredentials?.password).toBe('p@ssw0rd!');
    });
  });

  test('should show TLS certificate disclosures while TLS is enabled', async () => {
    const user = userEvent.setup();

    render(<TestWrapper />);

    // useTls defaults to true
    expect(screen.getByTestId('sr-tls-intro')).toBeInTheDocument();
    expect(screen.getByTestId('sr-tls-ca-disclosure')).toBeInTheDocument();
    expect(screen.getByTestId('sr-tls-mtls-disclosure')).toBeInTheDocument();

    await user.click(screen.getByTestId('sr-tls-toggle'));

    await waitFor(() => {
      expect(screen.queryByTestId('sr-tls-intro')).not.toBeInTheDocument();
    });
  });

  test('should upload client key and certificate through the mTLS dropzones', async () => {
    const user = userEvent.setup();
    let formValues: FormValues | undefined;

    render(
      <TestWrapper
        onFormChange={(values) => {
          formValues = values;
        }}
      />
    );

    await user.click(screen.getByTestId('sr-tls-mtls-disclosure-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('add-sr-clientKey-button')).toBeInTheDocument();
    });

    const keyDropzone = screen.getByTestId('add-sr-clientKey-button');
    const keyInput = keyDropzone.querySelector('input[type="file"]');
    const keyFile = new File(['-----BEGIN PRIVATE KEY-----\nKEY'], 'client.key', { type: 'application/x-pkcs12' });
    await user.upload(keyInput as HTMLInputElement, keyFile);

    await waitFor(() => {
      expect(screen.getByTestId('sr-clientKey-status')).toBeInTheDocument();
      expect(formValues?.schemaRegistry?.mtls?.clientKey?.pemContent).toBe('-----BEGIN PRIVATE KEY-----\nKEY');
    });

    const certDropzone = screen.getByTestId('add-sr-clientCert-button');
    const certInput = certDropzone.querySelector('input[type="file"]');
    const certFile = new File(['-----BEGIN CERTIFICATE-----\nCERT'], 'client.pem', {
      type: 'application/x-pem-file',
    });
    await user.upload(certInput as HTMLInputElement, certFile);

    await waitFor(() => {
      expect(screen.getByTestId('sr-clientCert-status')).toBeInTheDocument();
      expect(formValues?.schemaRegistry?.mtls?.clientCert?.pemContent).toBe('-----BEGIN CERTIFICATE-----\nCERT');
    });

    // Removing the key clears it from form state again
    await user.click(screen.getByTestId('remove-sr-clientKey-button'));
    await waitFor(() => {
      expect(formValues?.schemaRegistry?.mtls?.clientKey).toBeUndefined();
    });
  });
});
