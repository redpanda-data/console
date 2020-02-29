import React, { Component } from 'react';
import { Button, Spin, Icon, Modal } from 'antd';
import { observer } from 'mobx-react';
import { observable } from 'mobx';

import SvgLoginWave from '../../assets/login_wave.svg';
import PngLogo from '../../assets/logo2.png';
import { uiState } from '../../state/uiState';

interface Provider {
    displayName: string,
    url: string
}
interface ProvidersResponse {
    providers: Provider[]
    loginTitle: string
}

async function getProviders() {
    const response = await fetch('/auth/providers', {
        method: 'GET',
        cache: 'no-cache',
        mode: 'no-cors'
    });

    if (!response.ok) {
        throw new Error(await response.text())
    }

    return (await response.json() as ProvidersResponse);
}


@observer
class Login extends Component {

    @observable providersResponse: ProvidersResponse | null = null;
    @observable providersError: string | null = null;

    async componentDidMount() {
        try {
            this.providersResponse = await getProviders();
        } catch (err) {
            this.providersResponse = null;
            this.providersError = err.toString();
        }
    }

    render() {
        const ar = this.providersResponse ? this.providersResponse.providers : null;

        return <div className='login'>

            <Modal
                title="Access Denied"
                visible={uiState.loginError != null}
                cancelButtonProps={{ style: { display: 'none' } }}
                closable={false}
                maskClosable={false}
                onOk={() => { uiState.loginError = null; }}
            >
                <p>{uiState.loginError}</p>
            </Modal>

            <div className='loginContainer'>

                <div className='loginLeft'>
                    <div className='loginLogo' style={{ height: '60px', marginBottom: 'auto', marginTop: '2rem' }}>
                        <img src={PngLogo} style={{ height: '100%', filter: 'brightness(0.45) sepia(1) saturate(1.5) hue-rotate(165deg)' }} />
                        <span style={{ textTransform: 'uppercase', color: '#498FC2', letterSpacing: 12, fontSize: '1.75rem', paddingLeft: '20px' }}>Kowl</span>
                    </div>

                    <div style={{ justifySelf: 'center', marginBottom: 'auto' }}>
                        <p style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{this.providersResponse?.loginTitle ?? "Howdy!"}</p>
                        <p style={{ width: '230px' }}>Login with an OAuth provider to continue</p>
                    </div>
                </div>

                <div className='loginRight'>
                    <div style={{ float: 'left', height: '100%', width: '110px' }}>
                        <img src={SvgLoginWave} style={{ width: 'auto', height: '100%', zoom: '102%' }} />
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
                        }} />

                        <div style={{ marginTop: 'auto' }}>
                            <div style={{ fontSize: '22px', fontWeight: 600, textTransform: 'uppercase' }}>
                                <span>Sign in</span><br />
                                <span style={{ fontSize: '0.66em' }}>to access KOWL</span>
                            </div>
                            <div className='loginButtonList'>
                                {ar && ar.map(p => (
                                    // <div key={p.displayName} className='loginButton' onClick={() => window.location.replace(p.url)}>
                                    //     <Icon type='google' style={{ fontSize: '26px', marginRight: '6px' }} />
                                    //     <span>
                                    //         Login with {p.displayName}
                                    //     </span>
                                    // </div>
                                    <div key={p.displayName} className='loginButton2' onClick={() => window.location.replace(p.url)}>
                                        <Icon type='github' style={{ marginBottom: '6px' }} />
                                        <span>
                                            {p.displayName}
                                        </span>
                                    </div>
                                ))
                                    || (this.providersError && <div style={{
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
                                        <div style={{ fontSize: '0.9em' }}>{this.providersError}</div>
                                    </div>)
                                    || <div style={{ fontSize: '14px', marginTop: '32px', color: '#ddd' }}><Spin size='large' /><br />Retreiving login method from backend...</div>}
                            </div>
                        </div>

                        <div style={{ marginTop: 'auto', fontWeight: 'normal' }}>Copyright © 2020 CloudHut. All rights reserved.</div>
                    </div>
                </div>

            </div>
        </div>

        // <div className='loginRight'>
        //             {ar && ar.map(p => (
        //                 // <div key={p.displayName} className='loginButton' onClick={() => window.location.replace(p.url)}>
        //                 //     <Icon type='google' style={{ fontSize: '26px', marginRight: '6px' }} />
        //                 //     <span>
        //                 //         Login with {p.displayName}
        //                 //     </span>
        //                 // </div>

        //                 <div key={p.displayName} className='loginButton2' onClick={() => window.location.replace(p.url)}>
        //                     <Icon type='github' style={{ marginBottom: '6px' }} />
        //                     <span>
        //                         {p.displayName}
        //                     </span>
        //                 </div>

        //             )) || <div><Spin />Retreiving login method from backend...</div>}
        //         </div>
    }
}
export default Login;
