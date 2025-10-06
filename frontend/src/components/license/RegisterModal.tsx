import { CheckIcon } from '@chakra-ui/icons';
import { ConnectError } from '@connectrpc/connect';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormField,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { Controller, type SubmitHandler, useForm } from 'react-hook-form';
import { capitalizeFirst } from 'utils/utils';

import { useLicenseSignupMutation } from '../../react-query/api/signup';
import { api } from '../../state/backendApi';

type FieldViolation = {
  field: string;
  description: string;
};

type BadRequest = {
  fieldViolations: FieldViolation[];
};

function isBadRequest(obj: any): obj is { type: string; debug: BadRequest } {
  return obj && obj.type === 'google.rpc.BadRequest';
}

interface RegisterFormData {
  givenName: string;
  familyName: string;
  email: string;
  companyName?: string;
}

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RegisterModal = observer(({ isOpen, onClose }: RegisterModalProps) => {
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

  const onSubmit: SubmitHandler<RegisterFormData> = async (data) => {
    setIsSubmitting(true);
    setFieldErrors({}); // Clear previous field errors

    try {
      await signupMutation.mutateAsync({
        givenName: data.givenName,
        familyName: data.familyName,
        email: data.email,
        companyName: data.companyName || 'unknown',
      });

      // Refresh licenses after successful registration
      api.listLicenses();

      // Show success state
      setIsSuccess(true);
    } catch (error) {
      // Handle field-level errors from the API response
      if (error instanceof ConnectError) {
        const newFieldErrors: Record<string, string> = {};

        error.details?.forEach((detail) => {
          if (isBadRequest(detail)) {
            detail.debug.fieldViolations.forEach((violation) => {
              newFieldErrors[violation.field] = violation.description;
            });
          }
        });

        setFieldErrors(newFieldErrors);
      }

      console.error('Registration failed:', error);
    } finally {
      setIsSubmitting(false);
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

  return (
    <Modal isCentered isOpen={isOpen} onClose={handleClose} size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Register</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {isSuccess ? (
            <VStack align="center" py={4} spacing={6}>
              <Box
                alignItems="center"
                bg="green.100"
                borderRadius="full"
                display="flex"
                h="80px"
                justifyContent="center"
                w="80px"
              >
                <CheckIcon color="green.500" h="40px" w="40px" />
              </Box>
              <VStack align="center" spacing={2}>
                <Text fontSize="lg" fontWeight="bold" textAlign="center">
                  This cluster has been successfully registered
                </Text>
                <Text color="gray.600" textAlign="center">
                  Enjoy 30 more days of enterprise features.
                </Text>
              </VStack>
            </VStack>
          ) : (
            <Box>
              <Text color="gray.600" mb={4}>
                Register this cluster for an additional 30 days of enterprise features.
              </Text>

              {signupMutation.error && Object.keys(fieldErrors).length === 0 && (
                <Alert mb={4} status="error" variant="left-accent">
                  <AlertIcon />
                  <AlertDescription>
                    {capitalizeFirst(signupMutation.error.rawMessage) || 'Registration failed. Please try again.'}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)}>
                <Flex gap={4} mb={4}>
                  <FormField
                    errorText={errors.givenName?.message || fieldErrors.givenName}
                    flex={1}
                    isInvalid={!!errors.givenName || !!fieldErrors.givenName}
                    label="First name"
                  >
                    <Controller
                      control={control}
                      name="givenName"
                      render={({ field }) => <Input {...field} autoComplete="given-name" placeholder="First name" />}
                      rules={{
                        required: 'First name is required',
                        pattern: {
                          value: /^[\p{L}\p{M}\p{N} '_-]+$/u,
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
                  </FormField>

                  <FormField
                    errorText={errors.familyName?.message || fieldErrors.familyName}
                    flex={1}
                    isInvalid={!!errors.familyName || !!fieldErrors.familyName}
                    label="Last name"
                  >
                    <Controller
                      control={control}
                      name="familyName"
                      render={({ field }) => <Input {...field} autoComplete="family-name" placeholder="Last name" />}
                      rules={{
                        required: 'Last name is required',
                        pattern: {
                          value: /^[\p{L}\p{M}\p{N} '_-]+$/u,
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
                  </FormField>
                </Flex>

                <FormField
                  errorText={errors.email?.message || fieldErrors.email}
                  isInvalid={!!errors.email || !!fieldErrors.email}
                  label="Email address"
                  mb={4}
                >
                  <Controller
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <Input {...field} autoComplete="email" placeholder="Email address" type="email" />
                    )}
                    rules={{
                      required: 'Email address is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Please enter a valid email address',
                      },
                    }}
                  />
                </FormField>

                <Text color="gray.600" fontSize="sm" mb={4}>
                  By registering you acknowledge having read and accepted our{' '}
                  <Link color="blue.500" href="https://www.redpanda.com/legal/privacy-policy" target="_blank">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link
                    color="blue.500"
                    href="https://www.redpanda.com/legal/redpanda-subscription-terms-and-conditions"
                    target="_blank"
                  >
                    Terms of Service
                  </Link>
                  .
                </Text>
              </form>
            </Box>
          )}
        </ModalBody>

        <ModalFooter>
          {isSuccess ? (
            <Button onClick={handleClose}>Close</Button>
          ) : (
            <>
              <Button mr={3} onClick={handleClose} variant="ghost">
                Close
              </Button>
              <Button
                isDisabled={signupMutation.isPending}
                isLoading={isSubmitting || signupMutation.isPending}
                loadingText="Registering..."
                onClick={handleSubmit(onSubmit)}
              >
                Register
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});
