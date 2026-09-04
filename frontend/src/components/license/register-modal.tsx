import { ConnectError } from '@connectrpc/connect';
import { CheckIcon } from 'components/icons';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Field, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Link } from 'components/redpanda-ui/components/typography';
import { CircleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, type SubmitHandler, useForm } from 'react-hook-form';
import { capitalizeFirst } from 'utils/utils';

import { useLicenseSignupMutation } from '../../react-query/api/signup';
import { api } from '../../state/backend-api';

const NAME_VALIDATION_REGEX = /^[\p{L}\p{M}\p{N} '_-]+$/u;
const EMAIL_VALIDATION_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

type FieldViolation = {
  field: string;
  description: string;
};

type BadRequest = {
  fieldViolations: FieldViolation[];
};

function isBadRequest(obj: unknown): obj is { type: string; debug: BadRequest } {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    'type' in obj &&
    obj.type === 'google.rpc.BadRequest'
  );
}

type RegisterFormData = {
  givenName: string;
  familyName: string;
  email: string;
  companyName?: string;
};

type RegisterModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const RegisterModal = ({ isOpen, onClose }: RegisterModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const signupMutation = useLicenseSignupMutation();

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<RegisterFormData>({
    defaultValues: {
      givenName: '',
      familyName: '',
      email: '',
      companyName: '',
    },
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
  const onSubmit: SubmitHandler<RegisterFormData> = async (data) => {
    setIsSubmitting(true);
    setFieldErrors({}); // Clear previous field errors

    const companyName = data.companyName || 'unknown';
    try {
      await signupMutation.mutateAsync({
        givenName: data.givenName,
        familyName: data.familyName,
        email: data.email,
        companyName,
      });

      // Refresh licenses after successful registration
      api.listLicenses();

      // Show success state
      setIsSuccess(true);
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      // Handle field-level errors from the API response
      const isConnectError = error instanceof ConnectError;
      if (isConnectError) {
        const connectError = error as ConnectError;
        const newFieldErrors: Record<string, string> = {};
        const details = connectError.details ?? [];
        for (const detail of details) {
          if (isBadRequest(detail)) {
            for (const violation of detail.debug.fieldViolations) {
              newFieldErrors[violation.field] = violation.description;
            }
          }
        }
        setFieldErrors(newFieldErrors);
      }

      // biome-ignore lint/suspicious/noConsole: error logging for debugging registration failures
      console.error('Registration failed:', error);
    }
  };

  const handleClose = () => {
    reset();
    setFieldErrors({});
    setIsSuccess(false);
    signupMutation.reset();
    onClose();

    if (isSuccess) {
      // Refetch license data and enterprise features after successful registration
      api.listLicenses();
    }
  };

  const givenNameError = errors.givenName?.message || fieldErrors.givenName;
  const familyNameError = errors.familyName?.message || fieldErrors.familyName;
  const emailError = errors.email?.message || fieldErrors.email;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      open={isOpen}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Register</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isSuccess ? (
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="flex size-20 items-center justify-center rounded-full bg-success-wash">
                <CheckIcon className="text-success" size={40} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-center text-heading-sm">Cluster registered</div>
                <div className="text-center text-body text-subtle">Enjoy 30 more days of enterprise features.</div>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4 text-body text-subtle">
                Register this cluster for an additional 30 days of enterprise features.
              </div>

              {signupMutation.error && Object.keys(fieldErrors).length === 0 && (
                <Alert className="mb-4" icon={<CircleAlertIcon />} variant="destructive">
                  <AlertDescription>
                    {capitalizeFirst(signupMutation.error.rawMessage) || 'Registration failed. Please try again.'}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="mb-4 flex gap-4">
                  <Field data-invalid={Boolean(givenNameError) || undefined}>
                    <FieldLabel htmlFor="register-given-name">First name</FieldLabel>
                    <Controller
                      control={control}
                      name="givenName"
                      render={({ field }) => (
                        <Input {...field} autoComplete="given-name" id="register-given-name" placeholder="First name" />
                      )}
                      rules={{
                        required: 'First name is required',
                        pattern: {
                          value: NAME_VALIDATION_REGEX,
                          message: 'First name contains invalid characters',
                        },
                        minLength: {
                          value: 1,
                          message: 'First name is required',
                        },
                        maxLength: {
                          value: 255,
                          message: 'First name is too long',
                        },
                      }}
                    />
                    {givenNameError ? <FieldError>{givenNameError}</FieldError> : null}
                  </Field>

                  <Field data-invalid={Boolean(familyNameError) || undefined}>
                    <FieldLabel htmlFor="register-family-name">Last name</FieldLabel>
                    <Controller
                      control={control}
                      name="familyName"
                      render={({ field }) => (
                        <Input
                          {...field}
                          autoComplete="family-name"
                          id="register-family-name"
                          placeholder="Last name"
                        />
                      )}
                      rules={{
                        required: 'Last name is required',
                        pattern: {
                          value: NAME_VALIDATION_REGEX,
                          message: 'Last name contains invalid characters',
                        },
                        minLength: {
                          value: 1,
                          message: 'Last name is required',
                        },
                        maxLength: {
                          value: 255,
                          message: 'Last name is too long',
                        },
                      }}
                    />
                    {familyNameError ? <FieldError>{familyNameError}</FieldError> : null}
                  </Field>
                </div>

                <Field className="mb-4" data-invalid={Boolean(emailError) || undefined}>
                  <FieldLabel htmlFor="register-email">Email address</FieldLabel>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <Input
                        {...field}
                        autoComplete="email"
                        id="register-email"
                        placeholder="Email address"
                        type="email"
                      />
                    )}
                    rules={{
                      required: 'Email address is required',
                      pattern: {
                        value: EMAIL_VALIDATION_REGEX,
                        message: 'Enter a valid email address',
                      },
                    }}
                  />
                  {emailError ? <FieldError>{emailError}</FieldError> : null}
                </Field>

                <div className="mb-4 text-body-sm text-subtle">
                  By registering you acknowledge having read and accepted our{' '}
                  <Link href="https://www.redpanda.com/legal/privacy-policy" rel="noopener noreferrer" target="_blank">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link
                    href="https://www.redpanda.com/legal/redpanda-subscription-terms-and-conditions"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Terms of Service
                  </Link>
                  .
                </div>
              </form>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {isSuccess ? (
            <Button onClick={handleClose}>Close</Button>
          ) : (
            <>
              <Button onClick={handleClose} variant="ghost">
                Close
              </Button>
              {/* isLoading keeps the label in place and sets aria-busy, so the accessible name stays "Register". */}
              <Button isLoading={isSubmitting || signupMutation.isPending} onClick={handleSubmit(onSubmit)}>
                Register
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
