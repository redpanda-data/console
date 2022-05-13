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

import React, { Component } from 'react';
import { Spin, Modal } from 'antd';
import { observer } from 'mobx-react';
import { makeObservable, observable } from 'mobx';

import SvgLoginWave from '../../assets/login_wave.svg';
import PngLogo from '../../assets/logo2.png';
import { uiState } from '../../state/uiState';
import Icon, { GoogleOutlined, GithubOutlined } from '@ant-design/icons';
import OktaLogo from '../../utils/svg/OktaLogo';


const iconMap = new Map([
    ["google", <GoogleOutlined style={{ marginBottom: '6px' }} />],
    ["github", <GithubOutlined style={{ marginBottom: '6px' }} />],
    ["okta", <span style={{ display: 'inline-block', color: 'inherit', marginBottom: '6px', width: '20px', height: '20px', }}>{OktaLogo}</span>],
]);

interface ProvidersResponse {
    providers: Provider[];
    loginTitle: string;
}
interface Provider {
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
        let ar = this.providersResponse ? this.providersResponse.providers : null;
        if (ar)
            ar = ar.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));

        return <div className='login'>

            <Modal
                title="Access Denied"
                visible={uiState.loginError != null}
                cancelButtonProps={{ style: { display: 'none' } }}
                closable={false}
                maskClosable={false}
                onOk={() => { uiState.loginError = null; }}
            >
                <p style={{ whiteSpace: 'pre-wrap' }}>{uiState.loginError}</p>
            </Modal>

            <div className='loginContainer'>

                <div className='loginLeft'>
                    <div className='loginLogo' style={{ height: '60px', marginBottom: 'auto', marginTop: '2rem' }}>
                        <img src={PngLogo} style={{ height: '100%', filter: 'brightness(0.45) sepia(1) saturate(1.5) hue-rotate(165deg)' }} alt="" />
                        <span style={{ textTransform: 'uppercase', color: '#498FC2', letterSpacing: 12, fontSize: '1.75rem', paddingLeft: '20px' }}>Kowl</span>
                    </div>

                    <div style={{ justifySelf: 'center', marginBottom: 'auto' }}>
                        <p style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{this.providersResponse?.loginTitle ?? "Howdy!"}</p>
                        <p style={{ width: '230px' }}>Login with an OAuth provider to continue</p>
                    </div>
                </div>

                <div className='loginRight'>
                    <div style={{ float: 'left', height: '100%', width: '120px', overflow: 'hidden' }}>
                        <img src={SvgLoginWave} style={{ width: 'auto', height: 'calc(100% + 1px)', transform: 'translateX(-1px)' }} alt="" />
                        {/* <embed style={{ height:'100%'}} type="image/svg+xml" src={SvgLoginWave} /> */}
                    </div>
                    <div className="loginContainerRight">

                        <img src={PngLogo} style={{
                            position: 'absolute',
                            alignSelf: 'center',
                            zIndex: -5,
                            marginTop: '60px', height: '165px',
                            filter: 'brightness(0.1) sepia(1) saturate(6) hue-rotate(180deg)',
                            opacity: 0.7
                        }} alt="" />

                        <div style={{ marginTop: 'auto' }}>
                            <div style={{ fontSize: '22px', fontWeight: 600, textTransform: 'uppercase' }}>
                                <span>Sign in</span><br />
                                <span style={{ fontSize: '0.66em' }}>to access KOWL</span>
                            </div>
                            <div className='loginButtonList'>
                                {ar?.map(p => <LoginProviderButton provider={p} />)
                                    || (this.providersError && <ProvidersError error={this.providersError} />)
                                    || <div style={{ fontSize: '14px', marginTop: '32px', color: '#ddd' }}><Spin size='large' /><br />Retreiving login method from backend...</div>}
                            </div>
                        </div>

                        <div style={{ marginTop: 'auto', fontWeight: 'normal' }}>Copyright © 2020-{new Date().getFullYear()} CloudHut. All rights reserved.</div>
                    </div>
                </div>

            </div>
        </div>;
    }
}
export default Login;

function LoginProviderButton(props: { provider: Provider }): JSX.Element {
    const p = props.provider;

    return <div key={p.displayName} className='loginButton2' onClick={() => window.location.replace(p.url)}>
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
