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

import React, { Component } from "react";
import { Topic } from "../../../state/restInterfaces";
import "../../../utils/arrayExtensions";
import { api } from "../../../state/backendApi";
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {vs} from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import { uriTransformer as baseUriTransformer } from 'react-markdown';
import { DefaultSkeleton } from "../../../utils/tsxUtils";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { Button, Empty } from "antd";
import { observer } from "mobx-react";


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

function sanitizeUrl(uri: string, children?: any, title?: string | null): string {
    const baseTransformed = baseUriTransformer(uri);
    if (baseTransformed != uri) return baseTransformed;

    const cleanedUri = uri.trim().toLocaleLowerCase();

    for (const p of allowedProtocols)
        if (cleanedUri.startsWith(p)) {
            return uri;
        }

    return ""; // didn't match any allowed protocol, remove the link
}

@observer
export class TopicDocumentation extends Component<{ topic: Topic }> {

    private components = {
        code({node, inline, className, children, ...props}:any) {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter style={vs}
            customStyle={{
                "background-color": null,
                border: null,
                margin: null,
                padding: null,
            }}
            PreTag="div"
            language={match[1]}
            children={String(children).replace(/\n$/, '')} {...props} />
          ) : (
            <code className={className} {...props}>{children}</code>
          )
        }
      }

    render() {
        const docu = api.topicDocumentation.get(this.props.topic.topicName);
        if (docu === undefined) return DefaultSkeleton; // not yet loaded
        if (!docu.isEnabled)
            return errorNotConfigured;

        const markdown = docu?.text;
        if (markdown === null || markdown === undefined)
            return errorNotFound;

        if (markdown === '')
            return errorEmpty;

        return <div className='topicDocumentation'>
            <ReactMarkdown components={this.components} remarkPlugins={[remarkGfm, remarkEmoji]} children={markdown} skipHtml={false} transformLinkUri={sanitizeUrl} />
        </div>
    }
}

const errorNotConfigured = renderDocuError('Not Configured', <>
    <p>Topic Documentation is not configured in Redpanda Console.</p>
    <p>Provide the connection credentials in the Redpanda Console config, to fetch and display docmentation for the topics.</p>
</>);
const errorNotFound = renderDocuError('Not Found', <>
    <p>No documentation file was found for this topic.</p>
    <ul style={{ listStyle: 'none' }}>
        <li>Ensure the Git connection to the documentation repository is configured correctly in the Redpanda Console backend.</li>
        <li>Ensure that a markdown file (named just like the topic) exists in the repository.</li>
    </ul>
</>);
const errorEmpty = renderDocuError('Empty', <>
    <p>The documentation file is empty.</p>
    <p>In case you just changed the file, keep in mind that Redpanda Console will only<br />
        periodically check the documentation repo for changes (every minute by default).</p>
</>);

// todo: use common renderError function everywhere
// todo: use <MotionAlways> for them
function renderDocuError(title: string, body: JSX.Element) {
    return (
        <motion.div {...animProps} key={'b'} style={{ margin: '2rem 1rem' }}>
            <Empty description={null}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2>{title}</h2>

                    {body}
                </div>

                {/* todo: fix link once we have a better guide */}
                <a target="_blank" rel="noopener noreferrer" href="https://github.com/redpanda-data/kowl/blob/master/docs/config/kowl.yaml">
                    <Button type="primary">Redpanda Console Documentation</Button>
                </a>
            </Empty>
        </motion.div>
    );
}