import { Component } from "react";
import { observer } from "mobx-react";
import React from "react";
import { Layout, Spin } from "antd";
import { api, rest } from "../../state/backendApi";
import { UserData } from "../../state/restInterfaces";
import { appGlobal } from "../../state/appGlobal";

class LoginCompletePage extends Component<{ provider: string }> {

    componentDidMount() {
        this.completeLogin(this.props.provider, window.location);
    }

    async completeLogin(provider: string, location: Location) {
        const pathName = location.pathname;
        const query = location.search;

        const url = pathName + query;

        api.UserData = await rest<UserData>(url, 10, { method: 'GET', cache: 'no-cache', mode: 'no-cors' });
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