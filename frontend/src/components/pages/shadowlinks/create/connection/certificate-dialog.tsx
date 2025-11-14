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

import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Dropzone } from 'components/redpanda-ui/components/dropzone';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { useCallback, useEffect, useState } from 'react';

import { TLS_MODE, type TLSMode } from '../model';

export type CertificateType = 'ca' | 'clientCert' | 'clientKey';

interface CertificateValue {
  filePath?: string;
  pemContent?: string;
  fileName?: string;
}

interface CertificateDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  certificateType: CertificateType;
  mode: TLSMode;
  existingValue?: CertificateValue;
  onSave: (value: CertificateValue) => void;
}

const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  ca: 'CA certificate',
  clientCert: 'Client certificate',
  clientKey: 'Client private key',
};

const CERTIFICATE_DESCRIPTIONS: Record<CertificateType, string> = {
  ca: 'Certificate Authority certificate to verify server identity',
  clientCert: 'Client certificate for mutual TLS authentication',
  clientKey: 'Private key for client certificate',
};

export function CertificateDialog({
  isOpen,
  onOpenChange,
  certificateType,
  mode,
  existingValue,
  onSave,
}: CertificateDialogProps) {
  const [filePath, setFilePath] = useState(existingValue?.filePath ?? '');
  const [pemContent, setPemContent] = useState(existingValue?.pemContent ?? '');
  const [fileName, setFileName] = useState(existingValue?.fileName ?? '');

  // Reset state when dialog opens based on whether we're adding or editing
  useEffect(() => {
    if (isOpen) {
      if (existingValue) {
        // Edit mode: populate with existing values
        setFilePath(existingValue.filePath ?? '');
        setPemContent(existingValue.pemContent ?? '');
        setFileName(existingValue.fileName ?? '');
      } else {
        // Add mode: clear all fields
        setFilePath('');
        setPemContent('');
        setFileName('');
      }
    }
  }, [isOpen, existingValue]);

  const handleFileUpload = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      setPemContent(content);
      setFileName(file.name);
    };

    reader.readAsText(file);
  }, []);

  const handleSave = useCallback(() => {
    const value: CertificateValue = {
      filePath: mode === TLS_MODE.FILE_PATH ? filePath : undefined,
      pemContent: mode === TLS_MODE.PEM ? pemContent : undefined,
      fileName: mode === TLS_MODE.PEM ? fileName : undefined,
    };

    onSave(value);
    onOpenChange(false);
  }, [mode, filePath, pemContent, fileName, onSave, onOpenChange]);

  const handleCancel = useCallback(() => {
    // Reset to original values
    setFilePath(existingValue?.filePath ?? '');
    setPemContent(existingValue?.pemContent ?? '');
    setFileName(existingValue?.fileName ?? '');
    onOpenChange(false);
  }, [existingValue, onOpenChange]);

  const isValid = mode === TLS_MODE.FILE_PATH ? filePath.trim().length > 0 : pemContent.trim().length > 0;

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent data-testid={`certificate-dialog-${certificateType}`}>
        <DialogHeader>
          <DialogTitle>{CERTIFICATE_LABELS[certificateType]}</DialogTitle>
          <Text className="text-muted-foreground" variant="small">
            {CERTIFICATE_DESCRIPTIONS[certificateType]}
          </Text>
        </DialogHeader>

        <div className="space-y-4">
          {mode === TLS_MODE.PEM ? (
            <div className="space-y-2">
              <Dropzone
                accept={{
                  'application/x-pem-file': ['.pem'],
                  'application/x-x509-ca-cert': ['.crt', '.cer'],
                  'application/pkix-cert': ['.crt', '.cer'],
                  'application/x-pkcs12': ['.key'],
                }}
                data-testid="certificate-dropzone"
                maxFiles={1}
                onDrop={handleFileUpload}
              >
                {fileName && (
                  <Text className="text-muted-foreground" variant="small">
                    {fileName}
                  </Text>
                )}
                {!fileName && (
                  <Text className="text-muted-foreground" variant="small">
                    Drag and drop or click to replace
                  </Text>
                )}
              </Dropzone>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="filePath">Certificate file path</Label>
              <Input
                id="filePath"
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/etc/redpanda/certs/ca.crt"
                testId="file-path-input"
                value={filePath}
              />
              <Text className="text-muted-foreground" variant="small">
                The certificate must reside on the broker. Provide a relative path from the broker's configuration
                directory. Example: <InlineCode>/etc/redpanda/certs/ca.crt</InlineCode>
              </Text>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button data-testid="cancel-button" onClick={handleCancel} variant="outline">
            Cancel
          </Button>
          <Button data-testid="save-certificate-button" disabled={!isValid} onClick={handleSave}>
            {existingValue ? 'Update Certificate' : 'Add Certificate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
