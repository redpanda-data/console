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
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { CertificateDialog, type CertificateType } from './certificate-dialog';
import type { FormValues } from '../model';

export const MtlsConfiguration = () => {
  const { control, setValue } = useFormContext<FormValues>();
  const useTls = useWatch({ control, name: 'useTls' });
  const useMtls = useWatch({ control, name: 'useMtls' });
  const mtlsMode = useWatch({ control, name: 'mtlsMode' });
  const mtls = useWatch({ control, name: 'mtls' });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentCertType, setCurrentCertType] = useState<CertificateType>('ca');

  // Don't render if TLS is disabled
  if (!useTls) {
    return null;
  }

  const handleOpenDialog = (certType: CertificateType) => {
    setCurrentCertType(certType);
    setIsDialogOpen(true);
  };

  const handleSaveCertificate = (value: { filePath?: string; pemContent?: string; fileName?: string }) => {
    setValue(`mtls.${currentCertType}`, value);
  };

  const handleRemoveCertificate = (certType: CertificateType) => {
    setValue(`mtls.${certType}`, undefined);
  };

  const getCertificateLabel = (certType: CertificateType): string => {
    switch (certType) {
      case 'ca':
        return 'CA certificate';
      case 'clientCert':
        return 'Client certificate';
      case 'clientKey':
        return 'Client private key';
      default:
        return 'Certificate';
    }
  };

  const getCertificateValue = (certType: CertificateType) => mtls?.[certType];

  const renderCertificateButton = (certType: CertificateType) => {
    const cert = getCertificateValue(certType);
    const label = getCertificateLabel(certType);
    const hasCert = Boolean(cert?.filePath || cert?.pemContent);

    if (!hasCert) {
      return (
        <Button
          data-testid={`add-${certType}-button`}
          onClick={() => handleOpenDialog(certType)}
          type="button"
          variant="outline"
        >
          Add {label}
        </Button>
      );
    }

    const displayValue = cert?.fileName || cert?.filePath || 'Certificate added';

    return (
      <div
        className="flex items-center justify-between rounded-md bg-muted px-4 py-3"
        data-testid={`${certType}-status`}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">{label}</span>
          <span className="font-medium text-sm">{displayValue}</span>
        </div>
        <div className="flex gap-2">
          <Button
            data-testid={`edit-${certType}-button`}
            onClick={() => handleOpenDialog(certType)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            className="text-destructive hover:text-destructive"
            data-testid={`remove-${certType}-button`}
            onClick={() => handleRemoveCertificate(certType)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-4">
        <FormField
          control={control}
          name="useMtls"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <div>
                <FormLabel>mTLS</FormLabel>
              </div>
              <FormControl>
                <Tabs onValueChange={(value) => field.onChange(value === 'true')} value={String(field.value)}>
                  <TabsList variant="default">
                    <TabsTrigger data-testid="mtls-enabled-tab" value="true">
                      Enabled
                    </TabsTrigger>
                    <TabsTrigger data-testid="mtls-disabled-tab" value="false">
                      Disabled
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </FormControl>
            </FormItem>
          )}
        />

        {useMtls && (
          <div className="space-y-4" data-testid="mtls-certificates-form">
            <p className="text-muted-foreground text-sm">
              Mutual TLS requires three certificates for secure two-way authentication between client and server.
            </p>

            <FormField
              control={control}
              name="mtlsMode"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Certificate input method</FormLabel>
                  <FormControl>
                    <Tabs
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Clear all certificates when mode changes
                        setValue('mtls.ca', undefined);
                        setValue('mtls.clientCert', undefined);
                        setValue('mtls.clientKey', undefined);
                      }}
                      value={field.value}
                    >
                      <TabsList variant="default">
                        <TabsTrigger data-testid="mtls-mode-upload-tab" value="pem">
                          Upload
                        </TabsTrigger>
                        <TabsTrigger data-testid="mtls-mode-file-path-tab" value="file_path">
                          File path
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormField
                control={control}
                name="mtls.ca"
                render={() => (
                  <FormItem>
                    <div>{renderCertificateButton('ca')}</div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="mtls.clientCert"
                render={() => (
                  <FormItem>
                    <div>{renderCertificateButton('clientCert')}</div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="mtls.clientKey"
                render={() => (
                  <FormItem>
                    <div>{renderCertificateButton('clientKey')}</div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}
      </div>

      <CertificateDialog
        certificateType={currentCertType}
        existingValue={getCertificateValue(currentCertType)}
        isOpen={isDialogOpen}
        mode={mtlsMode}
        onOpenChange={setIsDialogOpen}
        onSave={handleSaveCertificate}
      />
    </>
  );
};
