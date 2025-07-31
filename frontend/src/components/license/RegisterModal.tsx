import {
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
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { Controller, type SubmitHandler, useForm } from 'react-hook-form';
import { useLicenseSignupMutation } from '../../react-query/api/signup';
import { api } from '../../state/backendApi';

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
    try {
      await signupMutation.mutateAsync({
        givenName: data.givenName,
        familyName: data.familyName,
        email: data.email,
        companyName: data.companyName || '',
      });
      
      // Refresh licenses after successful registration
      api.listLicenses();
      
      // Close modal and reset form
      onClose();
      reset();
    } catch (error) {
      // Error is handled by the mutation
      console.error('Registration failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Register</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box>
            <Text mb={4} color="gray.600">
              Register this cluster for an additional 30 days of enterprise features.
            </Text>
            
            <form onSubmit={handleSubmit(onSubmit)}>
              <Flex gap={4} mb={4}>
                <FormField
                  label="First name"
                  isInvalid={!!errors.givenName}
                  errorText={errors.givenName?.message}
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
                  isInvalid={!!errors.familyName}
                  errorText={errors.familyName?.message}
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
                isInvalid={!!errors.email}
                errorText={errors.email?.message}
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
                <Link href="https://redpanda.com/privacy" target="_blank" color="blue.500">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link href="https://redpanda.com/terms" target="_blank" color="blue.500">
                  Terms of Service
                </Link>
                .
              </Text>
            </form>
          </Box>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" onClick={handleClose} mr={3}>
            Close
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            isLoading={isSubmitting}
            loadingText="Registering..."
          >
            Register
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}); 