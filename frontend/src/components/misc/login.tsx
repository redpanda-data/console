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

import { useEffect } from 'react';
import { observer } from 'mobx-react';
import { observable } from 'mobx';
import SvgLogo from '../../assets/logos/redpanda-text-color.svg';
import { uiState } from '../../state/uiState';
import {
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text
} from '@redpanda-data/ui';
import { config as appConfig } from '../../config';
import { AuthenticationMethod } from '../../protogen/redpanda/api/console/v1alpha1/authentication_pb';


// const iconMap = new Map([
//     ['google', <GoogleOutlined key="google-icon" style={{ marginBottom: '6px' }} />],
//     ['github', <GithubOutlined key="github-icon" style={{ marginBottom: '6px' }} />],
//     ['okta', <span key="okata-icon" style={{ display: 'inline-block', color: 'inherit', marginBottom: '6px', width: '20px', height: '20px', }}>{OktaLogo}</span>],
//     ['azure ad', <span key="azure-ad-icon" style={{ display: 'inline-block', color: 'inherit', marginBottom: '6px', width: '20px', height: '20px', }}>{AzureADLogo}</span>]
// ]);

const authenticationApi = observable({
  methods: [] as AuthenticationMethod[],

  async refreshAuthenticationMethods(): Promise<void> {
    const client = appConfig.authenticationClient;
    if (!client) throw new Error('security client is not initialized');

    const { methods } = await client.listAuthenticationMethods({});
    this.methods = methods;
  }
})

const AUTH_ELEMENTS: Partial<Record<AuthenticationMethod, React.ReactElement>> = {
  [AuthenticationMethod.BASIC]: <div>Basic</div>,
  [AuthenticationMethod.OIDC]: <div>
    <Button variant="brand" as="a" href="/auth/login/oidc">
      Login with SSO
    </Button>
  </div>
}


const Login = observer(() => {
  useEffect(() => {
    authenticationApi.refreshAuthenticationMethods();
  }, []);

  // @observable providersResponse: ProvidersResponse | null = null;
    // @observable providersError: string | null = null;

    // async componentDidMount() {
    //     try {
    //         this.providersResponse = await getProviders();
    //     } catch (err) {
    //         this.providersResponse = null;
    //         this.providersError = (err as Error)?.message ?? String(err);
    //     }
    // }

        // const allProviders = this.providersResponse?.providers
        //     .slice()
        //     .sort((a, b) => a.displayName.localeCompare(b.displayName));

        // const providerButtons = allProviders?.filter(x => x.authenticationMethod != 'PLAIN_CREDENTIALS');
        // const plainLoginProvider = allProviders?.first(x => x.authenticationMethod == 'PLAIN_CREDENTIALS');


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
                        <Button
                            data-testid="login-error__ok-button"
                            onClick={() => {
                              uiState.loginError = null;
                        }}>
                           OK
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <div className="loginContainer">
              <div className="loginLeft">
                <Flex
                  className="loginLogo"
                  placeItems="center"
                  height={15}
                  mt={8}
                  mb={16}
                >
                  <img
                    src={SvgLogo}
                    style={{ height: '36px' }}
                    alt="Redpanda Console Logo"
                  />
                </Flex>

                <Stack spacing="2">
                  {/*<Text fontSize="18px" fontWeight="600" >{this.providersResponse?.loginTitle ?? 'Howdy!'}</Text>*/}
                  <Text fontSize="lg">Sign in with an OAuth provider to&nbsp;continue</Text>
                </Stack>
              </div>

              <div className="loginRight">
                <div className="loginContainerRight">
                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ fontSize: '18px', fontWeight: 600 }}>
                      <span>Sign in to Redpanda Console</span>
                      {authenticationApi.methods.map(method => <div key={method}>{AUTH_ELEMENTS[method]}</div>)}
                    </div>
                    <Flex placeContent="center" placeItems="center" mt={4} gap={2}>
                      {/*{providerButtons?.map((p) => (*/}
                      {/*  <LoginProviderButton key={p.displayName} provider={p} />*/}
                      {/*)) ||*/}
                      {/*  (this.providersError && (*/}
                      {/*    <ProvidersError error={this.providersError} />*/}
                      {/*  )) || (*/}
                      {/*    <div*/}
                      {/*      style={{*/}
                      {/*        fontSize: '14px',*/}
                      {/*        marginTop: '32px',*/}
                      {/*        color: '#ddd',*/}
                      {/*      }}*/}
                      {/*    >*/}
                      {/*    <Spinner size="lg" />*/}
                      {/*      <br />*/}
                      {/*      Retreiving login method from backend...*/}
                      {/*    </div>*/}
                      {/*  )}*/}
                    </Flex>
                  </div>

                  {/*<PlainLoginBox provider={plainLoginProvider} />*/}

                  <div style={{ marginTop: 'auto', fontWeight: 'normal' }}>
                    Copyright © {new Date().getFullYear()} Redpanda Data, Inc.
                    All rights reserved.
                  </div>
                </div>
              </div>
            </div>
          </div>
      );
})

export default Login;

// function LoginProviderButton(props: { provider: Provider }): JSX.Element {
//     const p = props.provider;
//
//   return (
//     <Button
//       colorScheme="brand"
//       key={p.displayName}
//       width={130}
//       height={85}
//       display="flex"
//       placeContent="center"
//       placeItems="center"
//       flexDirection="column"
//       onClick={() => window.location.replace(p.url)}
//     >
//       {iconMap.get(p.displayName.toLowerCase())}
//       <span>{p.displayName}</span>
//     </Button>
//   );
// }

// function ProvidersError(p: { error: string }) {
//     return <div style={{
//         fontSize: '15px',
//         color: 'rgb(202, 0, 0)',
//         width: '66%',
//         margin: 'auto',
//         fontWeight: 'bold',
//         fontFamily: 'sans-serif',
//         background: 'rgba(0,0,0, 0.33)',
//         borderRadius: '3px',
//         padding: '1em',
//     }}>
//         <div>Unable to fetch providers</div>
//         <div style={{ fontSize: '0.9em' }}>{p.error}</div>
//     </div>
// }

// const PlainLoginBox = observer((p: { provider?: Provider }) => {
//     const [error, setError] = useState<string | null>(null)
//     const provider = p.provider;
//     if (!provider) return null;
//
//     // Add missing '.' in front of url if needed
//     let loginUrl = provider.url;
//     if (!loginUrl.startsWith('.') && loginUrl.startsWith('/'))
//         loginUrl = '.' + loginUrl;
//
//     const state = plainLoginState;
//
//     return <>
//         <Box display="grid" width="300px" margin="1rem auto" textAlign="start" fontFamily='"Inter"'>
//             <FormLabel>User</FormLabel>
//             <Input
//                 data-testid="auth-username-input"
//                 borderColor="whiteAlpha.500"
//                 disabled={state.isLoading}
//                 value={state.username}
//                 onChange={e => state.username = e.target.value}
//             />
//
//             <FormLabel mt="2">Password</FormLabel>
//             <Input
//                 data-testid="auth-password-input"
//                 borderColor="whiteAlpha.500"
//                 type="password"
//                 disabled={state.isLoading}
//                 value={state.password}
//                 onChange={e => state.password = e.target.value}
//             />
//
//         <Button
//                 data-testid="auth-submit"
//                 marginTop="1rem"
//                 colorScheme="brand"
//                 disabled={state.isLoading}
//                 onClick={async () => {
//                     state.isLoading = true;
//                     try {
//                         const resp = await fetch(loginUrl, {
//                             method: 'POST',
//                             headers: [
//                                 ['Content-Type', 'application/json']
//                             ],
//                             body: toJson({
//                                 'username': state.username,
//                                 'password': state.password,
//                             })
//                         });
//
//                         if (resp.ok) {
//                             appGlobal.history.push('/overview');
//                         } else {
//                             let err = await resp.text();
//                             try {
//                                 const j = JSON.parse(err);
//                                 if (j.message)
//                                     err = j.message;
//                             } catch { }
//                             throw new Error(err);
//                         }
//                     }
//                     catch (err) {
//                         if (!(err instanceof Error)) {
//                             console.error(err);
//                             return;
//                         }
//
//                         setError(err.message)
//                     }
//                     finally {
//                         state.isLoading = false;
//                     }
//                 }}
//             >
//                 {state.isLoading && <Spinner size="sm" mr="1" />}
//                 Login
//             </Button>
//             <Modal
//                 isOpen={error !== null}
//                 onClose={() => {
//                     setError(null);
//                 }}
//             >
//                 <ModalOverlay />
//                 <ModalContent>
//                     <ModalHeader>Error</ModalHeader>
//                     <ModalBody>
//                         <blockquote>{error}</blockquote>
//                     </ModalBody>
//                     <ModalFooter gap={2}>
//                         <Button onClick={() => {
//                             setError(null);
//                         }}>
//                             OK
//                         </Button>
//                     </ModalFooter>
//                 </ModalContent>
//             </Modal>
//         </Box>
//     </>
// });
