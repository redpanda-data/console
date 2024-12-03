import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Dropzone,
  Flex,
  FormField,
  Link,
  Result,
  Text,
  Textarea,
} from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer, useLocalObservable } from 'mobx-react';
import type { FC } from 'react';
import type { SetLicenseRequest, SetLicenseResponse } from '../../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ENTERPRISE_FEATURES_DOCS_LINK } from '../../license/licenseUtils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';

const UploadLicenseForm: FC<{
  onUploadLicense: (license: string) => Promise<SetLicenseResponse>;
  onSuccess: () => void;
}> = observer(({ onUploadLicense, onSuccess }) => {
  const state = useLocalObservable(() => ({
    showFileUpload: true,
    licenseFile: undefined as string | undefined,
    license: '',
    errorMessage: '',
    setLicenseFile(value: string | undefined) {
      this.licenseFile = value;
    },
    setLicense(value: string) {
      this.license = value;
    },
    setErrorMessage(value: string) {
      this.errorMessage = value;
    },
  }));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();

        const content = (state.showFileUpload ? state.licenseFile : state.license) as string;
        await onUploadLicense(content)
          .then(() => {
            onSuccess();
            api.listLicenses(); // refetch licenses
          })
          .catch((err) => {
            state.errorMessage = err.message;
          });
      }}
    >
      <Flex flexDirection="column" gap={2} my={4}>
        {state.showFileUpload && (
          <Box>
            <Box border="1px dashed" borderColor="gray.200" padding="4" borderRadius="md">
              <Dropzone
                setRawString={(value) => {
                  state.setLicenseFile(value);
                }}
              />
            </Box>
            or
            <Button
              variant="link"
              onClick={() => {
                state.showFileUpload = false;
              }}
            >
              import text directly
            </Button>
          </Box>
        )}

        {state.showFileUpload === false && (
          <Box>
            <FormField label="License content">
              <Textarea
                rows={10}
                data-testid="license"
                onChange={(e) => state.setLicense(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              >
                {state.license}
              </Textarea>
            </FormField>
            or
            <Button
              variant="link"
              onClick={() => {
                state.showFileUpload = true;
              }}
            >
              upload file
            </Button>
          </Box>
        )}

        {state.errorMessage && (
          <Alert status="error" variant="left-accent">
            <AlertIcon />
            <AlertDescription>{state.errorMessage}</AlertDescription>
          </Alert>
        )}
        <Flex gap={2} mt={2}>
          <Button type="submit" data-testid="upload-license">
            Upload
          </Button>
          <Button
            onClick={() => {
              // TODO fix after https://github.com/redpanda-data/ui/issues/569 is resolved
              appGlobal.history.push('/overview');
            }}
            variant="outline"
          >
            Back to overview
          </Button>
        </Flex>
      </Flex>
    </form>
  );
});

@observer
export default class UploadLicensePage extends PageComponent<{}> {
  @observable success = false;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Upload Enterprise License';
    p.addBreadcrumb('Admin', '/admin');
    p.addBreadcrumb('Upload License', '/admin/upload-license');
  }

  render() {
    return (
      <PageContent>
        {this.success ? (
          <Box mb={20}>
            <Result
              status="success"
              title="License uploaded successfully"
              subTitle={
                <Flex flexDirection="column" gap={4}>
                  <Box>
                    <Text fontWeight="normal">
                      A restart will be needed to use Redpanda Console's enterprise features.
                    </Text>
                    <Text fontWeight="normal">
                      <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">
                        Enterprise features
                      </Link>{' '}
                      in your Redpanda cluster will be available right away.
                    </Text>
                  </Box>
                  <Box>
                    <Button
                      onClick={() => {
                        // TODO fix after https://github.com/redpanda-data/ui/issues/569 is resolved
                        appGlobal.history.push('/overview');
                      }}
                      variant="solid"
                    >
                      Back to overview
                    </Button>
                  </Box>
                </Flex>
              }
            />
          </Box>
        ) : (
          <>
            <Text>
              If you're interested in Redpanda Enterprise, please{' '}
              <Link href="https://www.redpanda.com/contact" target="_blank">
                contact us
              </Link>
              .
            </Text>
            <Text>
              If you're an existing customer, get in touch with{' '}
              <Link href="https://support.redpanda.com/hc/en-us" target="_blank">
                our support team
              </Link>{' '}
              to request a license. To see a list of what is available with Redpanda Enterprise, check{' '}
              <Link
                href="https://docs.redpanda.com/current/get-started/licenses/#redpanda-enterprise-edition"
                target="_blank"
              >
                our documentation
              </Link>
              .
            </Text>
            <Box width={{ sm: '100%', md: '600px' }}>
              <UploadLicenseForm
                onUploadLicense={async (license) => {
                  return await api.uploadLicense({
                    license,
                  } as SetLicenseRequest);
                }}
                onSuccess={() => {
                  this.success = true;
                }}
              />
            </Box>
          </>
        )}
      </PageContent>
    );
  }
}
