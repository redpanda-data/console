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
import { CheckIcon } from '@chakra-ui/icons';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { Controller, type SubmitHandler, useForm } from 'react-hook-form';
import { ConnectError } from '@connectrpc/connect';
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
        
        error.details?.forEach(detail => {
          if (isBadRequest(detail)) {
            detail.debug.fieldViolations.forEach(violation => {
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

    if(isSuccess) {
      // Refetch license data and enterprise features after successful registration
      api.listLicenses();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Register</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {isSuccess ? (
            <VStack spacing={6} align="center" py={4}>
              <Box
                w="80px"
                h="80px"
                borderRadius="full"
                bg="green.100"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <CheckIcon w="40px" h="40px" color="green.500" />
              </Box>
              <VStack spacing={2} align="center">
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
              <Text mb={4} color="gray.600">
                Register this cluster for an additional 30 days of enterprise features.
              </Text>
              
              {signupMutation.error && Object.keys(fieldErrors).length === 0 && (
                <Alert status="error" variant="left-accent" mb={4}>
                  <AlertIcon />
                  <AlertDescription>
                    {signupMutation.error.message || 'Registration failed. Please try again.'}
                  </AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleSubmit(onSubmit)}>
              <Flex gap={4} mb={4}>
                <FormField
                  label="First name"
                  isInvalid={!!errors.givenName || !!fieldErrors.givenName}
                  errorText={errors.givenName?.message || fieldErrors.givenName}
                  flex={1}
                >
                  <Controller
                    name="givenName"
                    control={control}
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
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="First name"
                        autoComplete="given-name"
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label="Last name"
                  isInvalid={!!errors.familyName || !!fieldErrors.familyName}
                  errorText={errors.familyName?.message || fieldErrors.familyName}
                  flex={1}
                >
                  <Controller
                    name="familyName"
                    control={control}
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
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="Last name"
                        autoComplete="family-name"
                      />
                    )}
                  />
                </FormField>
              </Flex>

              <FormField
                label="Email address"
                isInvalid={!!errors.email || !!fieldErrors.email}
                errorText={errors.email?.message || fieldErrors.email}
                mb={4}
              >
                <Controller
                  name="email"
                  control={control}
                  rules={{
                    required: 'Email address is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Please enter a valid email address',
                    },
                  }}
                  render={({ field }) => (
                    <Input
                      {...field}
                      type="email"
                      placeholder="Email address"
                      autoComplete="email"
                    />
                  )}
                />
              </FormField>

              <Text fontSize="sm" color="gray.600" mb={4}>
                By registering you acknowledge having read and accepted our{' '}
                <Link href="https://www.redpanda.com/legal/privacy-policy" target="_blank" color="blue.500">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link href="https://www.redpanda.com/legal/redpanda-subscription-terms-and-conditions" target="_blank" color="blue.500">
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
            <Button onClick={handleClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={handleClose} mr={3}>
                Close
              </Button>
              <Button
                onClick={handleSubmit(onSubmit)}
                isLoading={isSubmitting || signupMutation.isPending}
                loadingText="Registering..."
                isDisabled={signupMutation.isPending}
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