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
import { useEffect, useState } from 'react';

import { SingleSelect } from './select';
import SvgLogo from '../../assets/logos/redpanda-text-color.svg';
import { config as appConfig } from '../../config';
import {
  AuthenticationMethod,
  type LoginSaslScramRequest,
  SASLMechanism,
} from '../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { appGlobal } from '../../state/app-global';
import { useUIStateStore } from '../../state/ui-state';

const authenticationApiClient = {
  async refreshAuthenticationMethods(): Promise<{ methods: AuthenticationMethod[]; error: ConnectError | null }> {
    const client = appConfig.authenticationClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    try {
      const { methods } = await client.listAuthenticationMethods({});
      return { methods, error: null };
    } catch (e) {
      return { methods: [], error: e as ConnectError };
    }
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
};

const NoneAuthComponent = ({ hasMethodsError }: { hasMethodsError: boolean }) => {
  const { searchStr } = useLocation();
  const searchParams = new URLSearchParams(searchStr);
  const hasError = searchParams.has('error_code') || hasMethodsError;

  useEffect(() => {
    if (!hasError) {
      appGlobal.historyPush('/overview');
    }
  }, [hasError]);

  return hasError ? (
    <Alert status="info">
      <AlertIcon />
      <AlertDescription>No authentication is configured. Refresh the page to try again.</AlertDescription>
    </Alert>
  ) : null;
};

const BasicAuthComponent = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
  });
  const { username, password, mechanism } = credentials;
  const setUsername = (v: string) => setCredentials((prev) => ({ ...prev, username: v }));
  const setPassword = (v: string) => setCredentials((prev) => ({ ...prev, password: v }));
  const setMechanism = (v: SASLMechanism) => setCredentials((prev) => ({ ...prev, mechanism: v }));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSubmit = async () => {
    setIsLoading(true);
    await authenticationApiClient
      .loginWithUsername({ username, password, mechanism })
      .catch((ex) => {
        setError(ex.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <Flex flexDirection="column" gap={3}>
      <FormControl>
        <FormLabel>Username</FormLabel>
        <Input
          data-testid="auth-username-input"
          disabled={isLoading}
          onChange={(e) => setUsername(e.target.value)}
          value={username}
        />
      </FormControl>
      <FormControl>
        <FormLabel>Password</FormLabel>
        <Input
          data-testid="auth-password-input"
          disabled={isLoading}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          value={password}
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
          onChange={(value) => {
            setMechanism(value);
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
          value={mechanism}
        />
      </FormControl>
      {Boolean(error) && (
        <Alert status="error">
          <AlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button data-testid="auth-submit" onClick={handleSubmit} variant="brand">
        {Boolean(isLoading) && <Spinner mr="1" size="sm" />}
        Log in
      </Button>
    </Flex>
  );
};

const OidcAuthComponent = () => (
  <div>
    <Button as="a" href={`${appConfig.grpcBasePath}/auth/login/oidc`} variant="brand" width="full">
      Log in with OIDC
    </Button>
  </div>
);

const LoginPage = () => {
  const { searchStr } = useLocation();
  const searchParams = new URLSearchParams(searchStr);
  const [methods, setMethods] = useState<AuthenticationMethod[]>([]);
  const [methodsError, setMethodsError] = useState<ConnectError | null>(null);
  const loginError = useUIStateStore((s) => s.loginError);
  const setLoginError = useUIStateStore((s) => s.setLoginError);

  useEffect(() => {
    authenticationApiClient.refreshAuthenticationMethods().then(({ methods: m, error }) => {
      setMethods(m);
      setMethodsError(error);
    });
  }, []);

  return (
    <Flex minHeight="100vh" width="full">
      <Modal
        isOpen={loginError !== null}
        onClose={() => {
          setLoginError(null);
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Access Denied</ModalHeader>
          <ModalBody>
            <Text whiteSpace="pre-wrap">{loginError}</Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              data-testid="login-error__ok-button"
              onClick={() => {
                setLoginError(null);
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
                      'Authenticated through OIDC, but failed to authenticate with the Kafka API.',
                    console_internal: 'An unexpected error occurred. Check backend logs.',
                    permission_denied: `This user is not authorized to use Console. An administrator should grant user ${searchParams.get('oidc_subject') ?? ''} permissions in the Console configuration to proceed.`,
                  }[searchParams.get('error_code') as string] || 'An unexpected error occurred. Check backend logs.'}
                </AlertDescription>
              </Alert>
            </Box>
          )}
          <Stack my={5}>
            {methodsError ? (
              <Alert status="error">
                <AlertIcon />
                <AlertDescription>Failed to fetch authentication methods: {methodsError.message}</AlertDescription>
              </Alert>
            ) : null}
            {methods.reduce((acc, method, index) => {
              let authComponent: React.ReactNode = null;
              if (method === AuthenticationMethod.NONE) {
                authComponent = <NoneAuthComponent hasMethodsError={methodsError !== null} />;
              } else if (method === AuthenticationMethod.BASIC) {
                authComponent = <BasicAuthComponent />;
              } else if (method === AuthenticationMethod.OIDC) {
                authComponent = <OidcAuthComponent />;
              }
              if (authComponent) {
                if (index > 0) {
                  acc.push(<TextDivider key={`divider-${method}`} my={3} text="OR" />);
                }
                acc.push(<div key={method}>{authComponent}</div>);
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
};

export default LoginPage;
