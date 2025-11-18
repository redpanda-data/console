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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Dropzone } from 'components/redpanda-ui/components/dropzone';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from 'components/redpanda-ui/components/item';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertTriangle, FileUp, Lock, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { type FieldError, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import type { FormValues } from '../model';

type CertificateType = 'ca' | 'clientCert' | 'clientKey';

interface CertificateItemProps {
  title: string;
  description: string;
  certType: CertificateType;
  value?: { filePath?: string; pemContent?: string; fileName?: string };
  onFileUpload: (file: File) => void;
  onRemove: () => void;
  error?: FieldError;
}

const CertificateItem = ({
  title,
  description,
  certType,
  value,
  onFileUpload,
  onRemove,
  error,
}: CertificateItemProps) => {
  const hasValue = Boolean(value?.filePath || value?.pemContent);
  const displayValue = value?.fileName || value?.filePath || 'Certificate uploaded';

  const handleDropRejected = () => {
    toast.error('Invalid file type', {
      description: 'Please upload a valid certificate file (.pem, .crt, or .key)',
    });
  };

  if (!hasValue) {
    return (
      <div className="space-y-2">
        <Dropzone
          accept={{ 'application/x-pem-file': ['.pem', '.crt', '.key'] }}
          className="w-full p-0"
          data-testid={`${certType}-dropzone`}
          maxFiles={1}
          onDrop={(acceptedFiles) => {
            if (acceptedFiles[0]) {
              onFileUpload(acceptedFiles[0]);
            }
          }}
          onDropRejected={handleDropRejected}
          variant="ghost"
        >
          <Item
            className={cn('w-full border-dashed', error && '!border-destructive border-solid')}
            data-testid={`${certType}-item-empty`}
            variant="outline"
          >
            <ItemMedia variant="icon">
              <FileUp className={cn(error && 'text-destructive')} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className={cn(error && 'text-destructive')}>{title}</ItemTitle>
              <ItemDescription>{description}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Upload
              </div>
            </ItemActions>
          </Item>
        </Dropzone>
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>{error.message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Item data-testid={`${certType}-item-filled`} variant="outline">
      <ItemMedia variant="icon">
        <Lock />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{displayValue}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
          Remove
        </Button>
      </ItemActions>
    </Item>
  );
};

export const TlsCertificates = () => {
  const { control, setValue, clearErrors } = useFormContext<FormValues>();
  const { errors } = useFormState({ control });
  const useTls = useWatch({ control, name: 'useTls' });
  const useMtls = useWatch({ control, name: 'useMtls' });
  const mtlsMode = useWatch({ control, name: 'mtlsMode' });
  const mtls = useWatch({ control, name: 'mtls' });

  const [isConfirmModeChangeOpen, setIsConfirmModeChangeOpen] = useState(false);
  const [pendingModeChange, setPendingModeChange] = useState<string | null>(null);

  const hasCertificates = Boolean(
    mtls.ca?.filePath ||
      mtls.ca?.pemContent ||
      mtls.clientCert?.filePath ||
      mtls.clientCert?.pemContent ||
      mtls.clientKey?.filePath ||
      mtls.clientKey?.pemContent
  );

  const handleFileUpload = (certType: CertificateType, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const pemContent = e.target?.result as string;
      setValue(`mtls.${certType}`, {
        pemContent,
        fileName: file.name,
      });
    };
    reader.readAsText(file);
  };

  const handleRemoveCertificate = (certType: CertificateType) => {
    setValue(`mtls.${certType}`, undefined);
  };

  const handleModeChangeRequest = (newMode: string) => {
    if (hasCertificates) {
      setPendingModeChange(newMode);
      setIsConfirmModeChangeOpen(true);
    } else {
      setValue('mtlsMode', newMode as typeof mtlsMode);
    }
  };

  const handleConfirmModeChange = () => {
    if (pendingModeChange) {
      setValue('mtlsMode', pendingModeChange as typeof mtlsMode);
      setValue('mtls.ca', undefined);
      setValue('mtls.clientCert', undefined);
      setValue('mtls.clientKey', undefined);
      clearErrors('mtls');
      setIsConfirmModeChangeOpen(false);
      setPendingModeChange(null);
    }
  };

  const handleCancelModeChange = () => {
    setIsConfirmModeChangeOpen(false);
    setPendingModeChange(null);
  };

  const handleUseTlsChange = (checked: boolean) => {
    setValue('useTls', checked);
    if (!checked) {
      setValue('useMtls', false);
    }
  };

  const handleUseMtlsChange = (checked: boolean) => {
    setValue('useMtls', checked);
    if (checked && !useTls) {
      setValue('useTls', true);
    }
  };

  return (
    <>
      <Card className="shadow-none" data-testid="tls-certificates" size="full" variant="outlined">
        <CardHeader>
          <CardTitle>TLS Certificates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={control}
            name="useTls"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Item size="sm" variant="outline">
                    <ItemContent>
                      <ItemTitle>Enable TLS</ItemTitle>
                      <ItemDescription>Encrypt connection to source cluster with TLS/SSL</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch checked={field.value} onCheckedChange={handleUseTlsChange} testId="enable-tls-switch" />
                    </ItemActions>
                  </Item>
                </FormControl>
              </FormItem>
            )}
          />

          {useTls && (
            <>
              <FormField
                control={control}
                name="useMtls"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Item size="sm" variant="outline">
                        <ItemContent>
                          <ItemTitle>Enable Mutual TLS (mTLS)</ItemTitle>
                          <ItemDescription>Authenticate to source cluster with client certificates</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Switch
                            checked={field.value}
                            onCheckedChange={handleUseMtlsChange}
                            testId="enable-mtls-switch"
                          />
                        </ItemActions>
                      </Item>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="mt-4 space-y-4">
                <div>
                  <FormLabel>Certificate input method</FormLabel>
                  <Text className="text-muted-foreground text-sm">
                    Choose how to provide certificates: upload files or specify paths on the broker
                  </Text>
                </div>

                <Tabs onValueChange={handleModeChangeRequest} value={mtlsMode} variant="card">
                  <TabsList className="w-full" variant="underline">
                    <TabsTrigger className="flex-1" data-testid="mtls-mode-upload-tab" value="pem">
                      Upload
                    </TabsTrigger>
                    <TabsTrigger className="flex-1" data-testid="mtls-mode-file-path-tab" value="file_path">
                      File path
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent className="space-y-4 px-8 py-6" value="pem">
                    <CertificateItem
                      certType="ca"
                      description="Verify the identity of the source cluster"
                      error={errors.mtls?.ca as FieldError | undefined}
                      onFileUpload={(file) => handleFileUpload('ca', file)}
                      onRemove={() => handleRemoveCertificate('ca')}
                      title="CA Certificate"
                      value={mtls.ca}
                    />

                    {useMtls && (
                      <>
                        <CertificateItem
                          certType="clientCert"
                          description="Your client's public certificate"
                          error={errors.mtls?.clientCert as FieldError | undefined}
                          onFileUpload={(file) => handleFileUpload('clientCert', file)}
                          onRemove={() => handleRemoveCertificate('clientCert')}
                          title="Client Certificate"
                          value={mtls.clientCert}
                        />

                        <CertificateItem
                          certType="clientKey"
                          description="Your client's private key"
                          error={errors.mtls?.clientKey as FieldError | undefined}
                          onFileUpload={(file) => handleFileUpload('clientKey', file)}
                          onRemove={() => handleRemoveCertificate('clientKey')}
                          title="Client Private Key"
                          value={mtls.clientKey}
                        />
                      </>
                    )}
                  </TabsContent>

                  <TabsContent className="space-y-4 px-8 py-6" value="file_path">
                    <FormField
                      control={control}
                      name="mtls.ca"
                      render={() => (
                        <FormItem>
                          <FormLabel>CA Certificate path</FormLabel>
                          <FormControl>
                            <Input
                              data-testid="mtls-ca-path-input"
                              onChange={(e) => {
                                const value = e.target.value.trim();
                                setValue('mtls.ca', value ? { filePath: value } : undefined);
                              }}
                              placeholder="/etc/redpanda/certs/ca.crt"
                              type="text"
                              value={mtls.ca?.filePath || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {useMtls && (
                      <>
                        <FormField
                          control={control}
                          name="mtls.clientCert"
                          render={() => (
                            <FormItem>
                              <FormLabel>Client Certificate path</FormLabel>
                              <FormControl>
                                <Input
                                  data-testid="mtls-client-cert-path-input"
                                  onChange={(e) => {
                                    const value = e.target.value.trim();
                                    setValue('mtls.clientCert', value ? { filePath: value } : undefined);
                                  }}
                                  placeholder="/etc/redpanda/certs/client.crt"
                                  type="text"
                                  value={mtls.clientCert?.filePath || ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={control}
                          name="mtls.clientKey"
                          render={() => (
                            <FormItem>
                              <FormLabel>Client Private Key path</FormLabel>
                              <FormControl>
                                <Input
                                  data-testid="mtls-client-key-path-input"
                                  onChange={(e) => {
                                    const value = e.target.value.trim();
                                    setValue('mtls.clientKey', value ? { filePath: value } : undefined);
                                  }}
                                  placeholder="/etc/redpanda/certs/client.key"
                                  type="text"
                                  value={mtls.clientKey?.filePath || ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog onOpenChange={setIsConfirmModeChangeOpen} open={isConfirmModeChangeOpen}>
        <AlertDialogContent testId="mode-change-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch certificate input method?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching between Upload and File path will clear all existing certificates. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelModeChange} testId="cancel-mode-change">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmModeChange} testId="confirm-mode-change">
              Switch and clear certificates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
