import { CheckIcon } from 'components/icons';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from 'components/redpanda-ui/components/dropzone';
import { UploadCloud } from 'lucide-react';
import type React from 'react';

const CERTIFICATE_ACCEPT = {
  'application/x-pem-file': ['.pem'],
  'application/x-x509-ca-cert': ['.crt', '.cer'],
  'application/pkix-cert': ['.crt', '.cer'],
  'application/x-pkcs12': ['.key'],
};

export const ConfiguredBadge = () => (
  <Badge size="sm" tone="success" variant="subtle">
    Configured
  </Badge>
);

/** A check glyph and a file name, for a certificate that is already in place. */
export const UploadedFileName = ({ children }: { children: React.ReactNode }) => (
  <span className="flex w-full items-center gap-2">
    <span className="flex shrink-0">
      <TonedIcon className="h-4 w-4" icon={CheckIcon} tone="success" />
    </span>
    <span className="flex-1 truncate text-left font-medium text-foreground">{children}</span>
  </span>
);

type CertificateUploadRowProps = {
  /** Name of the uploaded file. When set, the row shows it in place of the upload prompt. */
  fileName?: string;
  onDrop: (files: File[]) => void;
  onError?: (error: Error) => void;
  testId: string;
};

/** A PEM upload target laid out as a single row: the upload prompt, or the uploaded file's name. */
export const CertificateUploadRow = ({ fileName, onDrop, onError, testId }: CertificateUploadRowProps) => (
  <Dropzone
    accept={CERTIFICATE_ACCEPT}
    className="h-auto! flex-row! justify-start!"
    maxFiles={1}
    onDrop={onDrop}
    onError={onError}
    // Dropzone picks empty or filled rendering from src. A placeholder File is enough for
    // DropzoneContent to render — the real PEM bytes live in form state.
    src={fileName ? [new File([], fileName)] : undefined}
    testId={testId}
    variant={fileName ? 'primary-outline' : 'outline'}
  >
    <DropzoneEmptyState className="my-0! w-full! flex-row! items-center! justify-start!">
      <span className="flex w-full items-center gap-2 text-muted-foreground">
        <UploadCloud className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Upload file</span>
      </span>
    </DropzoneEmptyState>
    <DropzoneContent>
      <UploadedFileName>{fileName}</UploadedFileName>
    </DropzoneContent>
  </Dropzone>
);
