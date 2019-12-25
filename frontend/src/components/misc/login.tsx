import React, { Component } from 'react';
import { Button, Spin } from 'antd';
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
                <h2>You must be logged in to use Kafka-Owl</h2>

                <ul>
                    {ar && ar.map(p => (
                        <li key={p.displayName}>
                            <Button icon='right' onClick={() => window.location.replace(p.url)}>Login with {p.displayName}</Button>
                        </li>
                    )) || <div><Spin /> Retreiving login method from backend...</div>}
                </ul>

            </div>
        </div>
    }
}
export default Login;
