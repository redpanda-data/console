import React, { CSSProperties } from "react";
import { observer } from "mobx-react";
import { observable } from "mobx";
import { ToJson } from "../../utils/utils";
import { Button, Layout, message, Space } from "antd";
import { CopyOutlined, CloseOutlined } from "@ant-design/icons";
import { envVarDebugAr } from "../../utils/env";

const { Content, Footer, Sider, Header } = Layout;

// background       rgb(35, 35, 35)
// div              rgba(206, 17, 38, 0.1)
// title            rgb(232, 59, 70)
// foreground
//    - main        rgb(252, 207, 207)
//    - highligh    rgb(204, 102, 102)
//    - secondary   rgb(135, 142, 145)

const valueStyle: CSSProperties = {
    whiteSpace: 'pre-line',
    lineBreak: 'anywhere',

    fontSize: '12px',
    background: 'rgba(20,20,20,0.05)',
    borderRadius: '2px',
    padding: '1rem',
}

interface InfoItem {
    name: string;
    value: string;
}

@observer
export class ErrorBoundary extends React.Component {
    @observable hasError = false;
    error: Error | null;
    errorInfo: object | null;

    infoItems: InfoItem[] = [];

    componentDidCatch(error: Error | null, errorInfo: object) {
        this.error = error;
        this.errorInfo = errorInfo;

        console.log("ErrorBoundary: 'error'")
        console.dir(error)
        console.log("ErrorBoundary: 'errorInfo'")
        console.dir(errorInfo)

        this.infoItems = [];

        // Type
        if (this.error?.name && this.error.name.toLowerCase() != 'error')
            this.infoItems.push({ name: "Type", value: this.error.name });

        // Message
        if (this.error?.message)
            this.infoItems.push({ name: "Message", value: this.error.message });
        else
            this.infoItems.push({ name: "Message", value: "(no message)" });

        // Call Stack
        if (this.error?.stack) {
            let s = this.error.stack;
            if (s.toLowerCase().startsWith("error:")) s = s.substr(6).trim(); // todo removePrefix()
            if (this.error.message && s.startsWith(this.error.message))
                s = s.substr(this.error.message.length).trimStart();
            this.infoItems.push({ name: "Stack", value: s });
        }

        // Component Stack
        if (this.errorInfo && (this.errorInfo as any).componentStack)
            this.infoItems.push({ name: "Components", value: (this.errorInfo as any).componentStack });
        else
            this.infoItems.push({
                name: "Components", value: this.errorInfo
                    ? "(componentStack not set) errorInfo as Json: \n" + ToJson(this.errorInfo)
                    : "(errorInfo was not set)"
            });


        // EnvVars
        try {
            const len = envVarDebugAr.map(e => e.name.length).reduce((p, c) => Math.max(p, c));
            this.infoItems.push({
                name: "Environment",
                value: envVarDebugAr.map(e => e.name.padEnd(len) + ': ' + e.value).join("\n")
            })
        } catch (ex) {
            this.infoItems.push({ name: "Environment", value: "(error retreiving env list)" });
        }


        // Remove indentation from stack traces
        for (const e of this.infoItems)
            e.value = e.value.replace(/\n\s*/g, "\n").trim();


        this.hasError = true;
    }

    copyError() {
        let data = "";

        for (const e of this.infoItems)
            data += `${e.name}:\n${e.value}\n\n`;

        navigator.clipboard.writeText(data);
        message.success('All info copied to clipboard!', 5);
    }

    dismiss() {
        this.error = null;
        this.errorInfo = null;
        this.hasError = false;
    }

    render() {
        if (!this.hasError) return this.props.children;

        return <Layout style={{ minHeight: '100vh', overflow: 'visible', padding: '2rem 4rem' }}>
            <div>
                <h1>Rendering Error!</h1>
                <p>Please report this at <a style={{ textDecoration: 'underline', fontWeight: 'bold' }} href="https://github.com/cloudhut/kowl/issues">our GitHub Repo</a></p>
                <Space size={'large'} style={{ marginTop: '0', marginBottom: '2rem' }}>
                    <Button icon={<CloseOutlined />} type='primary' size='large' style={{ width: '16rem' }} onClick={() => this.dismiss()}>
                        Dismiss
                    </Button>
                    <Button icon={<CopyOutlined />} ghost type='primary' size='large' onClick={() => this.copyError()}>
                        Copy Info
                    </Button>
                </Space>
            </div>
            <Content>
                <Space direction='vertical' size={30} style={{ width: '100%' }}>
                    {this.infoItems.map(e => <InfoItem key={e.name} data={e} />)}
                </Space>
            </Content>
        </Layout>
    }
}

const InfoItem = (p: { data: InfoItem }) => <div>
    <h2>{p.data.name}</h2>
    <pre style={valueStyle}>{p.data.value}</pre>
</div>