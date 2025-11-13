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

import { fireEvent, render, screen, waitFor } from 'test-utils';
import { vi } from 'vitest';

import { CertificateDialog } from './certificate-dialog';
import { TLS_MODE } from '../model';

describe('CertificateDialog', () => {
  const mockOnSave = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog rendering', () => {
    test('should render dialog when open', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.PEM}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByTestId('certificate-dialog-ca')).toBeInTheDocument();
      expect(screen.getByText('CA certificate')).toBeInTheDocument();
      expect(screen.getByText('Certificate Authority certificate to verify server identity')).toBeInTheDocument();
    });

    test('should not render dialog when closed', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={false}
          mode={TLS_MODE.PEM}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.queryByTestId('certificate-dialog-ca')).not.toBeInTheDocument();
    });

    test('should render with correct title for client certificate', () => {
      render(
        <CertificateDialog
          certificateType="clientCert"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.PEM}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('Client certificate')).toBeInTheDocument();
      expect(screen.getByText('Client certificate for mutual TLS authentication')).toBeInTheDocument();
    });

    test('should render with correct title for client key', () => {
      render(
        <CertificateDialog
          certificateType="clientKey"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.PEM}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('Client private key')).toBeInTheDocument();
      expect(screen.getByText('Private key for client certificate')).toBeInTheDocument();
    });
  });

  describe('Mode-based content display', () => {
    test('should show dropzone when mode is PEM', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.PEM}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('Drag and drop or click to replace')).toBeInTheDocument();
      expect(screen.queryByTestId('file-path-input')).not.toBeInTheDocument();
    });

    test('should show file path input when mode is FILE_PATH', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByTestId('file-path-input')).toBeInTheDocument();
      expect(screen.queryByTestId('certificate-dropzone')).not.toBeInTheDocument();
    });
  });

  describe('File path mode', () => {
    test('should allow entering file path', async () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      const filePathInput = screen.getByTestId('file-path-input');
      fireEvent.change(filePathInput, { target: { value: '/etc/redpanda/certs/ca.crt' } });

      await waitFor(() => {
        expect(filePathInput).toHaveValue('/etc/redpanda/certs/ca.crt');
      });
    });

    test('should disable save button when file path is empty', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      const saveButton = screen.getByTestId('save-certificate-button');
      expect(saveButton).toBeDisabled();
    });

    test('should enable save button when file path is provided', async () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      const filePathInput = screen.getByTestId('file-path-input');
      fireEvent.change(filePathInput, { target: { value: '/etc/redpanda/certs/ca.crt' } });

      await waitFor(() => {
        const saveButton = screen.getByTestId('save-certificate-button');
        expect(saveButton).not.toBeDisabled();
      });
    });

    test('should call onSave with file path when save is clicked', async () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      const filePathInput = screen.getByTestId('file-path-input');
      fireEvent.change(filePathInput, { target: { value: '/etc/redpanda/certs/ca.crt' } });

      const saveButton = screen.getByTestId('save-certificate-button');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          filePath: '/etc/redpanda/certs/ca.crt',
          pemContent: undefined,
          fileName: undefined,
        });
      });
    });

    test('should clear file path input when adding new certificate', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      const filePathInput = screen.getByTestId('file-path-input');
      expect(filePathInput).toHaveValue('');
    });
  });

  describe('Existing value handling', () => {
    test('should populate file path input with existing value', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={{
            filePath: '/etc/redpanda/certs/existing-ca.crt',
          }}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      const filePathInput = screen.getByTestId('file-path-input');
      expect(filePathInput).toHaveValue('/etc/redpanda/certs/existing-ca.crt');
    });

    test('should show Update Certificate button text when editing', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={{
            filePath: '/etc/redpanda/certs/ca.crt',
          }}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('Update Certificate')).toBeInTheDocument();
    });

    test('should show Add Certificate button text when adding new', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('Add Certificate')).toBeInTheDocument();
    });

    test('should display existing file name in upload mode', () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={{
            pemContent: '-----BEGIN CERTIFICATE-----\nMIID...',
            fileName: 'existing-ca.crt',
          }}
          isOpen={true}
          mode={TLS_MODE.PEM}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByText('existing-ca.crt')).toBeInTheDocument();
    });
  });

  describe('Cancel functionality', () => {
    test('should call onOpenChange with false when cancel is clicked', async () => {
      render(
        <CertificateDialog
          certificateType="ca"
          existingValue={undefined}
          isOpen={true}
          mode={TLS_MODE.FILE_PATH}
          onOpenChange={mockOnOpenChange}
          onSave={mockOnSave}
        />
      );

      const cancelButton = screen.getByTestId('cancel-button');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
