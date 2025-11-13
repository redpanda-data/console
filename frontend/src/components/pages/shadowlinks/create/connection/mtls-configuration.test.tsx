/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from 'components/redpanda-ui/components/form';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen, waitFor } from 'test-utils';

import { MtlsConfiguration } from './mtls-configuration';
import { FormSchema, type FormValues, initialValues, TLS_MODE } from '../model';

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const onSubmit = () => {
    // Test form submission
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <MtlsConfiguration />
        <button data-testid="submit-button" type="submit">
          Submit
        </button>
      </form>
    </Form>
  );
};

describe('MtlsConfiguration', () => {
  describe('Visibility based on TLS state', () => {
    test('should not render when TLS is disabled', () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: false,
        useMtls: false,
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.queryByTestId('mtls-enabled-tab')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mtls-disabled-tab')).not.toBeInTheDocument();
    });

    test('should render when TLS is enabled', () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: false,
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('mtls-enabled-tab')).toBeInTheDocument();
      expect(screen.getByTestId('mtls-disabled-tab')).toBeInTheDocument();
    });
  });

  describe('mTLS enabled state', () => {
    test('should show certificates form when Enabled is selected', () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: true,
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('mtls-enabled-tab')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('mtls-certificates-form')).toBeInTheDocument();
      expect(screen.getByTestId('add-ca-button')).toBeInTheDocument();
      expect(screen.getByTestId('add-clientCert-button')).toBeInTheDocument();
      expect(screen.getByTestId('add-clientKey-button')).toBeInTheDocument();
    });

    test('should hide certificates form when Disabled is selected', () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: false,
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('mtls-disabled-tab')).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByTestId('mtls-certificates-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('add-ca-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('add-clientCert-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('add-clientKey-button')).not.toBeInTheDocument();
    });
  });

  describe('Certificate management', () => {
    test('should display certificate status when certificate is added via file path', () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: true,
        mtlsMode: TLS_MODE.FILE_PATH,
        mtls: {
          ca: {
            filePath: '/etc/redpanda/certs/ca.crt',
          },
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('ca-status')).toBeInTheDocument();
      expect(screen.getByText('/etc/redpanda/certs/ca.crt')).toBeInTheDocument();
      expect(screen.getByTestId('edit-ca-button')).toBeInTheDocument();
      expect(screen.getByTestId('remove-ca-button')).toBeInTheDocument();
    });

    test('should display certificate status when certificate is added via upload', () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: true,
        mtlsMode: TLS_MODE.PEM,
        mtls: {
          ca: {
            pemContent: '-----BEGIN CERTIFICATE-----\nMIID...',
            fileName: 'ca.crt',
          },
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('ca-status')).toBeInTheDocument();
      expect(screen.getByText('ca.crt')).toBeInTheDocument();
      expect(screen.getByTestId('edit-ca-button')).toBeInTheDocument();
      expect(screen.getByTestId('remove-ca-button')).toBeInTheDocument();
    });

    test('should show all three certificate statuses when all are added', () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: true,
        mtlsMode: TLS_MODE.PEM,
        mtls: {
          ca: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCA...',
            fileName: 'ca.crt',
          },
          clientCert: {
            pemContent: '-----BEGIN CERTIFICATE-----\nCERT...',
            fileName: 'client.crt',
          },
          clientKey: {
            pemContent: '-----BEGIN PRIVATE KEY-----\nKEY...',
            fileName: 'client.key',
          },
        },
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('ca-status')).toBeInTheDocument();
      expect(screen.getByTestId('clientCert-status')).toBeInTheDocument();
      expect(screen.getByTestId('clientKey-status')).toBeInTheDocument();

      expect(screen.getByText('ca.crt')).toBeInTheDocument();
      expect(screen.getByText('client.crt')).toBeInTheDocument();
      expect(screen.getByText('client.key')).toBeInTheDocument();
    });
  });

  describe('Certificate dialog interaction', () => {
    test('should open dialog when add certificate button is clicked', async () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: true,
      };

      render(<TestWrapper defaultValues={customValues} />);

      const addCaButton = screen.getByTestId('add-ca-button');
      fireEvent.click(addCaButton);

      await waitFor(() => {
        expect(screen.getByTestId('certificate-dialog-ca')).toBeInTheDocument();
      });
    });

    test('should open dialog when edit button is clicked', async () => {
      const customValues: FormValues = {
        ...initialValues,
        useTls: true,
        useMtls: true,
        mtls: {
          ca: {
            filePath: '/etc/redpanda/certs/ca.crt',
          },
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      render(<TestWrapper defaultValues={customValues} />);

      const editButton = screen.getByTestId('edit-ca-button');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByTestId('certificate-dialog-ca')).toBeInTheDocument();
      });
    });
  });
});
