import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { describe, expect, rs, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetLicenseResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/license_pb';
import { setLicense } from 'protogen/redpanda/api/console/v1alpha1/license-LicenseService_connectquery';
import {
  LicenseSignupResponse_LicenseSchema,
  LicenseSignupResponse_SignInRequiredSchema,
  LicenseSignupResponse_VerificationRequiredSchema,
  LicenseSignupResponseSchema,
  ResendPasswordSetupEmailResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/signup_pb';
import { resendPasswordSetupEmail } from 'protogen/redpanda/api/console/v1alpha1/signup-SignupService_connectquery';
import { connectQueryWrapper } from 'test-utils';

import { ClaimLicenseStep, DEFAULT_CLAIM_URL } from './claim-license-step';
import { claimFromSignup } from './register-modal';

const CLAIM_URL = 'https://cloud.redpanda.com/try-enterprise/license?cluster_id=c1&platform=1&email=jane%40acme.com';

function renderStep(props: { existingAccount?: boolean; claimUrl?: string } = {}) {
  const setLicenseMock = rs.fn().mockReturnValue(create(SetLicenseResponseSchema, {}));
  const resendMock = rs.fn().mockReturnValue(create(ResendPasswordSetupEmailResponseSchema, {}));
  const transport = createRouterTransport(({ rpc }) => {
    rpc(setLicense, setLicenseMock);
    rpc(resendPasswordSetupEmail, resendMock);
  });
  const { wrapper } = connectQueryWrapper({ defaultOptions: { mutations: { retry: false } } }, transport);
  const onApplied = rs.fn();
  render(
    <ClaimLicenseStep
      claimUrl={props.claimUrl ?? CLAIM_URL}
      email="jane@acme.com"
      existingAccount={props.existingAccount ?? false}
      onApplied={onApplied}
    />,
    { wrapper }
  );
  return { setLicenseMock, resendMock, onApplied };
}

describe('claim license step', () => {
  test('after a set-password email, links to the license page and resends the link', async () => {
    const user = userEvent.setup();
    const { resendMock } = renderStep();

    expect(screen.getByText('Check your email')).toBeInTheDocument();
    expect(screen.getByTestId('claim-license-open')).toHaveAttribute('href', CLAIM_URL);
    expect(screen.getByTestId('claim-license-open')).toHaveAttribute('target', '_blank');

    await user.click(screen.getByTestId('claim-license-resend'));
    await waitFor(() => expect(resendMock).toHaveBeenCalledTimes(1));
    expect(resendMock.mock.calls[0][0].email).toBe('jane@acme.com');
    await waitFor(() => expect(screen.getByTestId('claim-license-resend')).toHaveTextContent('Link sent'));
  });

  test('for an existing account, asks to sign in and offers no resend', () => {
    renderStep({ existingAccount: true });

    expect(screen.getByText('Sign in to get your license')).toBeInTheDocument();
    expect(screen.queryByTestId('claim-license-resend')).not.toBeInTheDocument();
  });

  test('falls back to the Cloud license page when no link came back', () => {
    renderStep({ existingAccount: true, claimUrl: '' });

    expect(screen.getByTestId('claim-license-open')).toHaveAttribute('href', DEFAULT_CLAIM_URL);
  });

  test('applies a pasted license with SetLicense', async () => {
    const user = userEvent.setup();
    const { setLicenseMock, onApplied } = renderStep();

    expect(screen.getByTestId('claim-license-apply')).toBeDisabled();
    await user.type(screen.getByTestId('claim-license-key'), '  the-license-key  ');
    await user.click(screen.getByTestId('claim-license-apply'));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(setLicenseMock.mock.calls[0][0].license).toBe('the-license-key');
  });
});

describe('claimFromSignup', () => {
  test('returns null when the license came back', () => {
    const response = create(LicenseSignupResponseSchema, {
      license: create(LicenseSignupResponse_LicenseSchema, { licenseKey: 'k' }),
      verificationRequired: create(LicenseSignupResponse_VerificationRequiredSchema, { email: 'jane@acme.com' }),
    });
    expect(claimFromSignup(response, 'jane@acme.com')).toBeNull();
  });

  test('maps verification_required and sign_in_required', () => {
    expect(
      claimFromSignup(
        create(LicenseSignupResponseSchema, {
          verificationRequired: create(LicenseSignupResponse_VerificationRequiredSchema, {
            email: 'jane@acme.com',
            claimUrl: CLAIM_URL,
          }),
        }),
        'typed@acme.com'
      )
    ).toEqual({ email: 'jane@acme.com', claimUrl: CLAIM_URL, existingAccount: false });

    expect(
      claimFromSignup(
        create(LicenseSignupResponseSchema, {
          signInRequired: create(LicenseSignupResponse_SignInRequiredSchema, { claimUrl: CLAIM_URL }),
        }),
        'typed@acme.com'
      )
    ).toEqual({ email: 'typed@acme.com', claimUrl: CLAIM_URL, existingAccount: true });
  });
});
