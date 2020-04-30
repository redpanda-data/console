import React from "react";
import { observer } from "mobx-react";
import { observable } from "mobx";
import { ToJson } from "../../utils/utils";
import { Button } from "antd";



@observer
export class ErrorBoundary extends React.Component {
    @observable hasError = false;
    error: Error | null;
    errorInfo: object | null;

    componentDidCatch(error: Error | null, errorInfo: object) {
        this.error = error;
        this.errorInfo = errorInfo;
        this.hasError = true;
    }

    render() {
        if (this.hasError) {
            let errorJson = ToJson(this.error);
            let errorInfoJson = ToJson(this.errorInfo);

            return <>
                <h1>Error</h1>
                <h3>Please report this on GitHub</h3>
                <h4><a href="https://github.com/cloudhut/kowl/issues">Kowl GitHub Issues</a></h4>
                <br />
                <br />
                <p>{errorJson}</p>
                <br />
                <p>{errorInfoJson}</p>
                <br />
                <Button type='primary' onClick={() => {
                    this.error = null;
                    this.errorInfo = null;
                    this.hasError = false;
                }}>Dismiss</Button>
            </>
        }

        return this.props.children;
    }
}