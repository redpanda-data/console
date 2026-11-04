import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Field, FieldLabel } from 'components/redpanda-ui/components/field';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { CircleAlertIcon, ExternalLinkIcon, MailIcon } from 'lucide-react';
import { useState } from 'react';
import { capitalizeFirst } from 'utils/utils';

import { useSetLicenseMutation } from '../../react-query/api/license';
import { useResendPasswordSetupEmailMutation } from '../../react-query/api/signup';

/** Where the license page lives when Redpanda did not return a link. */
export const DEFAULT_CLAIM_URL = 'https://cloud.redpanda.com/try-enterprise/license';

export type ClaimLicenseStepProps = {
  email: string;
  claimUrl: string;
  /** The email already had a Redpanda Cloud account, so no set-password email was sent. */
  existingAccount: boolean;
  onApplied: () => void;
};

/**
 * The register dialog's second step, when the trial license is not issued straight away. The license
 * belongs to a Redpanda Cloud account: the user gets it from the Cloud license page and pastes it here.
 * Console cannot sign in to Redpanda Cloud itself, so the key comes back by paste rather than redirect.
 */
export const ClaimLicenseStep = ({ email, claimUrl, existingAccount, onApplied }: ClaimLicenseStepProps) => {
  const [licenseKey, setLicenseKey] = useState('');
  const setLicenseMutation = useSetLicenseMutation();
  const resendMutation = useResendPasswordSetupEmailMutation();
  const licensePageUrl = claimUrl || DEFAULT_CLAIM_URL;

  const applyLicense = async () => {
    await setLicenseMutation.mutateAsync({ license: licenseKey.trim() });
    onApplied();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-heading-sm">{existingAccount ? 'Sign in to get your license' : 'Check your email'}</div>
        {existingAccount ? (
          <div className="text-body text-subtle">
            <strong>{email}</strong> already has a Redpanda Cloud account. Sign in to it to get your license.
          </div>
        ) : (
          <div className="text-body text-subtle">
            We sent a link to <strong>{email}</strong>. Open it and set a password for your Redpanda Cloud account. This
            proves the address is yours. Then get your license.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          as="a"
          href={licensePageUrl}
          icon={<ExternalLinkIcon />}
          rel="noopener noreferrer"
          target="_blank"
          testId="claim-license-open"
        >
          Get license
        </Button>
        {!existingAccount && (
          <Button
            disabled={resendMutation.isSuccess}
            icon={<MailIcon />}
            isLoading={resendMutation.isPending}
            onClick={() => resendMutation.mutate({ email })}
            testId="claim-license-resend"
            variant="ghost"
          >
            {resendMutation.isSuccess ? 'Link sent' : 'Resend link'}
          </Button>
        )}
      </div>

      {resendMutation.error && (
        <Alert icon={<CircleAlertIcon />} variant="destructive">
          <AlertDescription>
            {capitalizeFirst(resendMutation.error.rawMessage) || 'Unable to send the link. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel htmlFor="claim-license-key">Paste your license key</FieldLabel>
        <Textarea
          autoComplete="off"
          id="claim-license-key"
          onChange={(e) => setLicenseKey(e.target.value)}
          placeholder="Copy the key from the license page and paste it here"
          resize="vertical"
          rows={4}
          spellCheck={false}
          testId="claim-license-key"
          value={licenseKey}
        />
      </Field>

      {setLicenseMutation.error && (
        <Alert icon={<CircleAlertIcon />} variant="destructive">
          <AlertDescription>
            {capitalizeFirst(setLicenseMutation.error.rawMessage) || 'Unable to apply the license. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      <div>
        <Button
          disabled={licenseKey.trim() === ''}
          isLoading={setLicenseMutation.isPending}
          onClick={() => {
            applyLicense().catch(() => {
              // The error is shown above from the mutation state.
            });
          }}
          testId="claim-license-apply"
        >
          Apply license
        </Button>
      </div>
    </div>
  );
};
