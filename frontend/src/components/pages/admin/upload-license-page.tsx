import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from 'components/redpanda-ui/components/dropzone';
import { Field, FieldLabel } from 'components/redpanda-ui/components/field';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Link } from 'components/redpanda-ui/components/typography';
import { CheckCircle2Icon, CircleAlertIcon } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';
import { docsLinks } from 'utils/docs-links';

import type { SetLicenseRequest, SetLicenseResponse } from '../../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { ENTERPRISE_FEATURES_DOCS_LINK } from '../../license/license-utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

const UploadLicenseForm: FC<{
  onUploadLicense: (license: string) => Promise<SetLicenseResponse>;
  onSuccess: () => void;
}> = ({ onUploadLicense, onSuccess }) => {
  const [showFileUpload, setShowFileUpload] = useState(true);
  const [licenseFile, setLicenseFile] = useState<string | undefined>(undefined);
  const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);
  const [license, setLicense] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async () => {
    setErrorMessage('');
    const content = (showFileUpload ? licenseFile : license) as string;
    await onUploadLicense(content)
      .then(() => {
        onSuccess();
        api.listLicenses(); // refetch licenses
      })
      .catch((err) => {
        setErrorMessage(err.message);
      });
  };

  return (
    <div>
      <div className="my-4 flex flex-col gap-2">
        {Boolean(showFileUpload) && (
          <div>
            <Dropzone
              // The Registry Dropzone reports rejections only through onError and then never calls
              // onDrop — without this a rejected drop would be silent, where Chakra's took the first
              // file regardless. `maxFiles` is 1, so a multi-file drop lands here.
              onDrop={(acceptedFiles) => {
                const file = acceptedFiles.at(0);
                if (!file) {
                  return;
                }
                setErrorMessage('');
                file
                  .text()
                  .then((text) => {
                    // Only mark the drop accepted once the read succeeded, or the dropzone would
                    // show the filename while `licenseFile` stayed undefined.
                    setLicenseFile(text);
                    setDroppedFiles(acceptedFiles);
                  })
                  .catch((err: Error) => setErrorMessage(err.message));
              }}
              onError={(err) => setErrorMessage(err.message)}
              src={droppedFiles}
              testId="license-dropzone"
            >
              <DropzoneEmptyState />
              <DropzoneContent />
            </Dropzone>
            or
            <Button onClick={() => setShowFileUpload(false)} variant="link">
              import text directly
            </Button>
          </div>
        )}

        {showFileUpload === false && (
          <div>
            <Field>
              <FieldLabel htmlFor="license">License content</FieldLabel>
              <Textarea
                autoComplete="off"
                id="license"
                onChange={(e) => setLicense(e.target.value)}
                rows={10}
                spellCheck={false}
                testId="license"
                value={license}
              />
            </Field>
            or
            <Button onClick={() => setShowFileUpload(true)} variant="link">
              upload file
            </Button>
          </div>
        )}

        {Boolean(errorMessage) && (
          <Alert icon={<CircleAlertIcon />} variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <div className="mt-2 flex gap-2">
          <Button data-testid="upload-license" onClick={handleSubmit} type="button">
            Upload
          </Button>
          <Button
            onClick={() => {
              appGlobal.historyPush('/overview');
            }}
            variant="outline"
          >
            Back to overview
          </Button>
        </div>
      </div>
    </div>
  );
};

export default class UploadLicensePage extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Upload Enterprise License';
    p.addBreadcrumb('Upload License', '/upload-license');
  }

  render() {
    return <UploadLicensePageContent />;
  }
}

const UploadLicensePageContent: FC = () => {
  const [success, setSuccess] = useState(false);

  return (
    <PageContent>
      {success ? (
        <div className="mb-20 flex flex-col items-center gap-4 text-center">
          <CheckCircle2Icon className="size-[72px] text-success" />
          {/* license.spec.ts asserts on `h1:has-text("License uploaded")`. */}
          <h1 className="text-heading-lg">License uploaded</h1>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-body">A restart will be needed to use Redpanda Console's enterprise features.</p>
              <p className="text-body">
                <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
                  Enterprise features
                </Link>{' '}
                in your Redpanda cluster will be available right away.
              </p>
            </div>
            <div>
              <Button
                onClick={() => {
                  appGlobal.historyPush('/overview');
                }}
                variant="primary"
              >
                Back to overview
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="text-body">
            If you're interested in Redpanda Enterprise, please{' '}
            <Link href="https://www.redpanda.com/contact" rel="noopener noreferrer" target="_blank">
              contact us
            </Link>
            .
          </p>
          <p className="text-body">
            If you're an existing customer, get in touch with{' '}
            <Link href="https://support.redpanda.com/hc/en-us" rel="noopener noreferrer" target="_blank">
              our support team
            </Link>{' '}
            to request a license. To see a list of what is available with Redpanda Enterprise, check{' '}
            <Link href={docsLinks.selfManaged.enterpriseEdition} rel="noopener noreferrer" target="_blank">
              our documentation
            </Link>
            .
          </p>
          <div className="w-full md:w-[600px]">
            <UploadLicenseForm
              onSuccess={() => setSuccess(true)}
              onUploadLicense={async (license) =>
                await api.uploadLicense({
                  license,
                } as SetLicenseRequest)
              }
            />
          </div>
        </>
      )}
    </PageContent>
  );
};
