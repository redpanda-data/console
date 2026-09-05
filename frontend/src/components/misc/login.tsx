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
import { useLocation } from '@tanstack/react-router';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button, buttonVariants } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Field, FieldLabel, FieldSeparator } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { RedpandaLogo } from 'components/redpanda-ui/components/redpanda-logo';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CircleAlertIcon, InfoIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { SingleSelect } from './select';
import wavingPanda from '../../assets/redpanda/WavingPanda.svg';
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
    <Alert icon={<InfoIcon />} variant="informative">
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
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="auth-username">Username</FieldLabel>
        <Input
          disabled={isLoading}
          id="auth-username"
          onChange={(e) => setUsername(e.target.value)}
          testId="auth-username-input"
          value={username}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="auth-password">Password</FieldLabel>
        <Input
          disabled={isLoading}
          id="auth-password"
          onChange={(e) => setPassword(e.target.value)}
          testId="auth-password-input"
          type="password"
          value={password}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="sasl-mechanism">SASL Mechanism</FieldLabel>
        <SingleSelect<SASLMechanism>
          id="sasl-mechanism"
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
      </Field>
      {Boolean(error) && (
        <Alert icon={<CircleAlertIcon />} variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button data-testid="auth-submit" disabled={isLoading} onClick={handleSubmit} variant="brand">
        {Boolean(isLoading) && <Spinner className="mr-1" />}
        Log in
      </Button>
    </div>
  );
};

const OidcAuthComponent = () => (
  <div>
    {/* An anchor, not a Button: this navigates to the backend's OIDC entry point. */}
    <a
      className={cn(buttonVariants({ variant: 'brand' }), 'w-full')}
      href={`${appConfig.grpcBasePath}/auth/login/oidc`}
    >
      Log in with OIDC
    </a>
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
    <div className="flex min-h-screen w-full">
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setLoginError(null);
          }
        }}
        open={loginError !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access Denied</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="whitespace-pre-wrap">{loginError}</div>
          </DialogBody>
          <DialogFooter>
            <Button
              data-testid="login-error__ok-button"
              onClick={() => {
                setLoginError(null);
              }}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="min-w-[400px] flex-[8]">
        <div className="mx-auto mt-[50px] w-full max-w-[350px] px-4">
          {/* The logo art is a fixed-ink asset, exempt from the token migration. */}
          <RedpandaLogo style={{ color: '#121827', height: '30px' }} />
          <div className="h-10" />
          <h1 className="text-heading-lg">Log in</h1>
          {searchParams.has('error_code') && (
            <div className="py-4">
              <Alert icon={<CircleAlertIcon />} variant="destructive">
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
            </div>
          )}
          <div className="my-5 flex flex-col gap-2">
            {methodsError ? (
              <Alert icon={<CircleAlertIcon />} variant="destructive">
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
                  // Chakra's TextDivider was a rule with a centred label — FieldSeparator already is.
                  acc.push(
                    <div className="py-3" key={`divider-${method}`}>
                      <FieldSeparator className="uppercase">OR</FieldSeparator>
                    </div>
                  );
                }
                acc.push(<div key={method}>{authComponent}</div>);
              }
              return acc;
            }, [] as React.ReactNode[])}
          </div>
        </div>
      </div>
      {/* Brand panel. The gradient is fixed art, like the logo — it does not follow the theme. */}
      <div
        className="hidden flex-[5] items-center justify-center pt-[10%] md:flex"
        style={{
          background: 'linear-gradient(170deg, rgba(237,127,102,1) 58%, rgba(226,64,27,1) 58.2%)',
        }}
      >
        <img alt="Waving Panda" className="h-[300px]" src={wavingPanda} />
      </div>
    </div>
  );
};

export default LoginPage;
