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

import { Component, useState } from 'react';
import { observer } from 'mobx-react';
import { makeObservable, observable } from 'mobx';
import { uiState } from '../../state/uiState';
import { GoogleOutlined, GithubOutlined } from '@ant-design/icons';
import OktaLogo from '../../utils/svg/OktaLogo';
import { Box, Button, FormLabel, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Spinner, Stack, Text } from '@redpanda-data/ui';
import { appGlobal } from '../../state/appGlobal';
import { toJson } from '../../utils/jsonUtils';
import AzureADLogo from '../../utils/svg/AzureADLogo';


const iconMap = new Map([
    ['google', <GoogleOutlined key="google-icon" style={{ marginBottom: '6px' }} />],
    ['github', <GithubOutlined key="github-icon" style={{ marginBottom: '6px' }} />],
    ['okta', <span key="okata-icon" style={{ display: 'inline-block', color: 'inherit', marginBottom: '6px', width: '20px', height: '20px', }}>{OktaLogo}</span>],
    ['azure ad', <span key="azure-ad-icon" style={{ display: 'inline-block', color: 'inherit', marginBottom: '6px', width: '20px', height: '20px', }}>{AzureADLogo}</span>]
]);

interface ProvidersResponse {
    providers: Provider[];
    loginTitle: string;
}
interface Provider {
    authenticationMethod: 'OAUTH' | 'PLAIN_CREDENTIALS';
    displayName: string,
    url: string;
}

type Prompt =
    | 'none'
    | 'consent'
    | 'select_account';

async function getProviders(prompt?: Prompt) {
    let url = './auth/providers';
    if (prompt)
        url += `?prompt=${prompt}`;

    const response = await fetch(url, {
        method: 'GET',
        cache: 'no-cache',
        mode: 'no-cors'
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return (await response.json() as ProvidersResponse);
}


@observer
class Login extends Component {
    constructor(p: any) {
        super(p);
        makeObservable(this);
    }


    @observable providersResponse: ProvidersResponse | null = null;
    @observable providersError: string | null = null;

    async componentDidMount() {
        try {
            this.providersResponse = await getProviders();
        } catch (err) {
            this.providersResponse = null;
            this.providersError = (err as Error)?.message ?? String(err);
        }
    }

    render() {
        const allProviders = this.providersResponse?.providers
            .slice()
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

        const providerButtons = allProviders?.filter(x => x.authenticationMethod != 'PLAIN_CREDENTIALS');
        const plainLoginProvider = allProviders?.first(x => x.authenticationMethod == 'PLAIN_CREDENTIALS');


        return (
          <div className="login">
              <Modal
                  isOpen={uiState.loginError != null}
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
                        <Button onClick={() => {
                              uiState.loginError = null;
                        }}>
                           OK
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <div className="loginContainer">
              <div className="loginLeft">
                <div
                  className="loginLogo"
                  style={{
                    height: '60px',
                    marginTop: '2rem',
                    marginBottom: '4rem',
                  }}
                >
                  <img
                    src="/logos/redpanda-text-color.svg"
                    style={{ height: '36px' }}
                    alt="Redpanda Console Logo"
                  />
                </div>

                <Stack spacing="2">
                  <Text fontSize="18px" fontWeight="600" >{this.providersResponse?.loginTitle ?? 'Howdy!'}</Text>
                  <Text fontSize="lg">Sign in with an OAuth provider to&nbsp;continue</Text>
                </Stack>
              </div>

              <div className="loginRight">
                <div className="loginContainerRight">
                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ fontSize: '18px', fontWeight: 600 }}>
                      <span>Sign in to Redpanda Console</span>
                    </div>
                    <div className="loginButtonList">
                      {providerButtons?.map((p) => (
                        <LoginProviderButton key={p.displayName} provider={p} />
                      )) ||
                        (this.providersError && (
                          <ProvidersError error={this.providersError} />
                        )) || (
                          <div
                            style={{
                              fontSize: '14px',
                              marginTop: '32px',
                              color: '#ddd',
                            }}
                          >
                          <Spinner size="lg" />
                            <br />
                            Retreiving login method from backend...
                          </div>
                        )}
                    </div>
                  </div>

                  <PlainLoginBox provider={plainLoginProvider} />

                  <div style={{ marginTop: 'auto', fontWeight: 'normal' }}>
                    Copyright © {new Date().getFullYear()} Redpanda Data, Inc.
                    All rights reserved.
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
    }
}
export default Login;

function LoginProviderButton(props: { provider: Provider }): JSX.Element {
    const p = props.provider;

    return <div key={p.displayName} className="loginButton2" onClick={() => window.location.replace(p.url)}>
        {iconMap.get(p.displayName.toLowerCase())}
        <span>{p.displayName}</span>
    </div>
}

function ProvidersError(p: { error: string }) {
    return <div style={{
        fontSize: '15px',
        color: 'rgb(202, 0, 0)',
        width: '66%',
        margin: 'auto',
        fontWeight: 'bold',
        fontFamily: 'sans-serif',
        background: 'rgba(0,0,0, 0.33)',
        borderRadius: '3px',
        padding: '1em',
    }}>
        <div>Unable to fetch providers</div>
        <div style={{ fontSize: '0.9em' }}>{p.error}</div>
    </div>
}

const plainLoginState = observable({
    isLoading: false,
    username: '',
    password: '',
});

const PlainLoginBox = observer((p: { provider?: Provider }) => {
    const [error, setError] = useState<string | null>(null)
    const provider = p.provider;
    if (!provider) return null;

    // Add missing '.' in front of url if needed
    let loginUrl = provider.url;
    if (!loginUrl.startsWith('.') && loginUrl.startsWith('/'))
        loginUrl = '.' + loginUrl;

    const state = plainLoginState;

    return <>
        <Box display="grid" width="300px" margin="1rem auto" textAlign="start" fontFamily='"Inter"'>
            <FormLabel>User</FormLabel>
            <Input
                borderColor="whiteAlpha.500"
                disabled={state.isLoading}
                value={state.username}
                onChange={e => state.username = e.target.value}
            />

            <FormLabel mt="2">Password</FormLabel>
            <Input
                borderColor="whiteAlpha.500"
                type="password"
                disabled={state.isLoading}
                value={state.password}
                onChange={e => state.password = e.target.value}
            />

        <Button
                marginTop="1rem"
                colorScheme="brand"
                disabled={state.isLoading}
                onClick={async () => {
                    state.isLoading = true;
                    try {
                        const resp = await fetch(loginUrl, {
                            method: 'POST',
                            headers: [
                                ['Content-Type', 'application/json']
                            ],
                            body: toJson({
                                'username': state.username,
                                'password': state.password,
                            })
                        });

                        if (resp.ok) {
                            appGlobal.history.push('/overview');
                        } else {
                            let err = await resp.text();
                            try {
                                const j = JSON.parse(err);
                                if (j.message)
                                    err = j.message;
                            } catch { }
                            throw new Error(err);
                        }
                    }
                    catch (err) {
                        if (!(err instanceof Error)) {
                            console.error(err);
                            return;
                        }

                        setError(err.message)
                    }
                    finally {
                        state.isLoading = false;
                    }
                }}
            >
                {state.isLoading && <Spinner size="sm" mr="1" />}
                Login
            </Button>
            <Modal
                isOpen={error !== null}
                onClose={() => {
                    setError(null);
                }}
            >
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Error</ModalHeader>
                    <ModalBody>
                        <blockquote>{error}</blockquote>
                    </ModalBody>
                    <ModalFooter gap={2}>
                        <Button onClick={() => {
                            setError(null);
                        }}>
                            OK
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    </>
});
