import React, { Component } from "react";
import { TopicDetail } from "../../../state/restInterfaces";
import "../../../utils/arrayExtensions";
import { api } from "../../../state/backendApi";
import ReactMarkdown from 'react-markdown';
import { url } from "inspector";
import { uriTransformer as baseUriTransformer } from 'react-markdown';
import { DefaultSkeleton } from "../../../utils/tsxUtils";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import Card from "../../misc/Card";
import { Button, Empty } from "antd";


// Test for link sanitizer
/*
<a href="javascript:alert('h4x0red!');">
My nonsuspious link
</a>
*/

const allowedProtocols = [
    "http://",
    "https://",
    "mailto://",
];

function sanitizeUrl(uri: string, children?: React.ReactNode, title?: string | undefined): string {
    const baseTransformed = baseUriTransformer(uri);
    if (baseTransformed != uri) return baseTransformed;

    const cleanedUri = uri.trim().toLocaleLowerCase();

    for (const p of allowedProtocols)
        if (cleanedUri.startsWith(p)) {
            return uri;
        }

    return ""; // didn't match any allowed protocol, remove the link
}


export class TopicDocumentation extends Component<{ topic: TopicDetail }> {
    render() {
        let docu = api.topicDocumentation.get(this.props.topic.topicName);
        if (docu == null) return DefaultSkeleton; // not yet loaded
        if (!docu.isEnabled) return renderNotConfigured();

        let markdown = docu.text ?? '';

        if (markdown === '') {
            markdown = `> The documentation file is empty.`;
        }

        return <div className='topicDocumentation'>
            <ReactMarkdown source={markdown} escapeHtml={false} transformLinkUri={sanitizeUrl} />
        </div>
    }
}

function renderNotConfigured() {
    return (
        <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
            <Card style={{ padding: '2rem 2rem', paddingBottom: '3rem' }}>
                <Empty description={null}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h2>Not Configured</h2>

                        <p>
                            Topic Documentation is not configured in Kowl.
                            <br />
                            Provide the connection credentials in the Kowl config, to fetch and display docmentation for the topics.
                        </p>
                    </div>

                    {/* todo: fix link once we have a better guide */}
                    <a target="_blank" rel="noopener noreferrer" href="https://github.com/cloudhut/kowl/blob/master/docs/config/kowl.yaml">
                        <Button type="primary">Kowl Documentation</Button>
                    </a>
                </Empty>
            </Card>
        </motion.div>
    );
}