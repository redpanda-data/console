/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { ConnectError } from '@connectrpc/connect';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Avatars,
  Box,
  Button,
  Container,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spacer,
  Spinner,
  Stack,
  Text,
  TextDivider,
} from '@redpanda-data/ui';
import { useLocation } from '@tanstack/react-router';
import { observable } from 'mobx';
import { observer, useLocalObservable } from 'mobx-react';
import { useEffect } from 'react';

import { SingleSelect } from './select';
import SvgLogo from '../../assets/logos/redpanda-text-color.svg';
import { config as appConfig } from '../../config';
import {
  AuthenticationMethod,
  type LoginSaslScramRequest,
  SASLMechanism,
} from '../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { appGlobal } from '../../state/app-global';
import { uiState } from '../../state/ui-state';

const authenticationApi = observable({
  methods: [] as AuthenticationMethod[],
  methodsErrorResponse: null as ConnectError | null,

  async refreshAuthenticationMethods(): Promise<void> {
    const client = appConfig.authenticationClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    const { methods } = await client.listAuthenticationMethods({}).catch((e: ConnectError) => {
      this.methodsErrorResponse = e;
      return { methods: [] };
    });
    this.methods = methods;
  },

  async loginWithUsername({
    username,
    password,
    mechanism,
  }: {
    username: string;
    password: string;
    mechanism: SASLMechanism;
  }): Promise<void> {
    const client = appConfig.authenticationClient;

    if (!client) {
      throw new Error('security client is not initialized');
    }

    const response = await client
      .loginSaslScram({
        username,
        password,
        mechanism,
      } as LoginSaslScramRequest)
      .then(() => {
        appGlobal.historyPush('/overview');
      });

    // biome-ignore lint/suspicious/noConsole: debug logging
    console.log({ response });
  },
});

const AUTH_ELEMENTS: Partial<Record<AuthenticationMethod, React.FC>> = {
  [AuthenticationMethod.NONE]: observer(() => {
    useEffect(() => {
      appGlobal.historyPush('/overview');
    }, []);
    return null;
  }),
  [AuthenticationMethod.BASIC]: observer(() => {
    const formState = useLocalObservable(() => ({
      username: '',
      password: '',
      mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
      isLoading: false,
      error: undefined as string | undefined,
      setUsername(value: string) {
        this.username = value;
      },
      setPassword(value: string) {
        this.password = value;
      },
      async handleSubmit() {
        formState.isLoading = true;
        await authenticationApi
          .loginWithUsername({
            username: formState.username,
            password: formState.password,
            mechanism: formState.mechanism,
          })
          .catch((ex) => {
            formState.error = ex.message;
          })
          .finally(() => {
            formState.isLoading = false;
          });
      },
    }));

    return (
      <Flex flexDirection="column" gap={3}>
        <FormControl>
          <FormLabel>Username</FormLabel>
          <Input
            data-testid="auth-username-input"
            disabled={formState.isLoading}
            onChange={(e) => formState.setUsername(e.target.value)}
            value={formState.username}
          />
        </FormControl>
        <FormControl>
          <FormLabel>Password</FormLabel>
          <Input
            data-testid="auth-password-input"
            disabled={formState.isLoading}
            onChange={(e) => formState.setPassword(e.target.value)}
            type="password"
            value={formState.password}
          />
        </FormControl>

        <FormControl>
          <FormLabel>SASL Mechanism</FormLabel>
          <SingleSelect<SASLMechanism>
            chakraStyles={{
              control: (provided) => ({
                ...provided,
              }),
            }}
            onChange={(mechanism) => {
              formState.mechanism = mechanism;
            }}
            options={[
              {
                label: 'SCRAM-SHA-256',
                value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
              },
              {
                label: 'SCRAM-SHA-512',
                value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
              },
            ]}
            value={formState.mechanism}
          />
        </FormControl>
        {Boolean(formState.error) && (
          <Alert status="error">
            <AlertIcon />
            <AlertDescription>{formState.error}</AlertDescription>
          </Alert>
        )}
        <Button data-testid="auth-submit" onClick={formState.handleSubmit} variant="brand">
          {Boolean(formState.isLoading) && <Spinner mr="1" size="sm" />}
          Log in
        </Button>
      </Flex>
    );
  }),
  [AuthenticationMethod.OIDC]: () => (
    <div>
      <Button as="a" href={`${appConfig.grpcBasePath}/auth/login/oidc`} variant="brand" width="full">
        Log in with OIDC
      </Button>
    </div>
  ),
};

const LoginPage = observer(() => {
  const { search } = useLocation();
  const searchParams = new URLSearchParams(search);

  useEffect(() => {
    authenticationApi.refreshAuthenticationMethods();
  }, []);

  return (
    <Flex minHeight="100vh" width="full">
      <Modal
        isOpen={uiState.loginError !== null}
        onClose={() => {
          uiState.loginError = null;
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Access Denied</ModalHeader>
          <ModalBody>
            <Text whiteSpace="pre-wrap">{uiState.loginError}</Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              data-testid="login-error__ok-button"
              onClick={() => {
                uiState.loginError = null;
              }}
            >
              OK
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Box flex="8" minWidth="400px">
        <Container maxWidth="350px" mt={50}>
          <img alt="Redpanda Console Logo" src={SvgLogo} style={{ height: '30px' }} />
          <Spacer height={10} />
          <Heading as="h1" size="lg">
            Log in
          </Heading>
          {searchParams.has('error_code') && (
            <Box py={4}>
              <Alert status="error">
                <AlertIcon />
                <AlertDescription>
                  {{
                    token_exchange_failed: 'OIDC authentication failed. Check backend logs for details.',
                    kafka_authentication_failed:
                      'Authenticated via OIDC, but failed to authenticate with the Kafka API.',
                    console_internal: 'An unexpected error occurred. Check backend logs.',
                    permission_denied: `This user is not authorized to use Console. An administrator should grant user ${searchParams.get('oidc_subject') ?? ''} permissions in the Console configuration to proceed.`,
                  }[searchParams.get('error_code') as string] || 'An unexpected error occurred. Check backend logs.'}
                </AlertDescription>
              </Alert>
            </Box>
          )}
          <Stack my={5}>
            {authenticationApi.methodsErrorResponse ? (
              <Alert status="error">
                <AlertIcon />
                <AlertDescription>
                  Failed to fetch authentication methods: {authenticationApi.methodsErrorResponse.message}
                </AlertDescription>
              </Alert>
            ) : null}
            {authenticationApi.methods.reduce((acc, method, index) => {
              const AuthComponent = AUTH_ELEMENTS[method];
              if (AuthComponent) {
                if (index > 0) {
                  acc.push(<TextDivider key={`divider-${method}`} my={3} text="OR" />);
                }
                acc.push(
                  <div key={method}>
                    <AuthComponent />
                  </div>
                );
              }
              return acc;
            }, [] as React.ReactNode[])}
          </Stack>
        </Container>
      </Box>
      <Flex
        alignItems="center"
        background="linear-gradient(170deg, rgba(237,127,102,1) 58%, rgba(226,64,27,1) 58.2%);"
        backgroundColor="brand.400"
        flex="5"
        hideBelow="md"
        justifyContent="center"
        paddingTop="10%"
      >
        <Image alt="Waving Panda" height="300px" src={Avatars.wavingPandaSvg} />
      </Flex>
    </Flex>
  );
});

export default LoginPage;
