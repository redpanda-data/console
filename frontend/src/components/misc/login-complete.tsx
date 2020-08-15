import { Component } from "react";
import { observer } from "mobx-react";
import React from "react";
import { Layout, Spin } from "antd";
import { api, rest } from "../../state/backendApi";
import { UserData } from "../../state/restInterfaces";
import { appGlobal } from "../../state/appGlobal";
import fetchWithTimeout from "../../utils/fetchWithTimeout";
import { uiState } from "../../state/uiState";

class LoginCompletePage extends Component<{ provider: string }> {

    componentDidMount() {
        this.completeLogin(this.props.provider, window.location);
    }

    async completeLogin(provider: string, location: Location) {
        const pathName = location.pathname;
        const query = location.search;

        const url = "./auth/callbacks/" + provider + query;

        // todo: auth/callbacks/providerName

        try {
            const response = await fetchWithTimeout(url, 10 * 1000, { method: 'GET', cache: 'no-cache', mode: 'no-cors' });
            const text = await response.text();
            const obj = JSON.parse(text);
            console.log("complete login response: " + text);
            if (response.ok) {
                api.UserData = obj as UserData;
            } else {
                // try to read as error object
                const err = obj as { statusCode: number, message: string }
                throw err.message;
            }
        } catch (err) {
            uiState.loginError = String(err);
            appGlobal.history.push('/login');
            return;
        }

        console.log('login complete, user: ' + JSON.stringify(api.UserData));

        // const targetUrl = store.urlBeforeLogin;
        // store.urlBeforeLogin = null;
        // if(targetUrl){
        //     navigate(targetUrl);
        // } else{
        //     navigate('/');
        // }
        window.location.assign('/');
    }

    render() {
        return <div style={{ height: '100vh', display: 'flex', placeContent: 'center', background: '#f3f3f3' }}>
            <div style={{ display: 'flex', placeContent: 'center', placeItems: 'center', flexFlow: 'column' }}>
                <span style={{ fontSize: '1.5em', color: 'rgba(0,0,0,0.75)' }}>Completing login...</span><br />
                <Spin />
            </div>
        </div>
    }
}

export default LoginCompletePage;