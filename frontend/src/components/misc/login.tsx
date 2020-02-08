import React, { Component } from 'react';
import { Button, Spin, Icon } from 'antd';
import { observer } from 'mobx-react';
import { observable } from 'mobx';


interface Provider {
    displayName: string,
    url: string
}
interface ProvidersResponse {
    providers: Provider[]
}

async function getProviders() {
    const response = await fetch('/login/providers', {
        method: 'GET',
        cache: 'no-cache',
        mode: 'no-cors'
    });
    return (await response.json() as ProvidersResponse);
}


@observer
class Login extends Component {

    @observable providersResponse: ProvidersResponse | null = null;

    async componentDidMount() {
        this.providersResponse = await getProviders();
    }

    render() {
        const ar = this.providersResponse ? this.providersResponse.providers : null;

        return <div className='login'>
            <div className='loginContent'>
                <div className='loginLogo'>Kafka-Owl</div>
                <span className='loginSeperator' />
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

                    )) || <div><Spin />Retreiving login method from backend...</div>}
                </div>
            </div>
        </div>
    }
}
export default Login;
