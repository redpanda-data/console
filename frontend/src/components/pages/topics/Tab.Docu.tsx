import React, { Component } from "react";
import { TopicDetail } from "../../../state/restInterfaces";
import "../../../utils/arrayExtensions";
import { api } from "../../../state/backendApi";
import ReactMarkdown from 'react-markdown';
import { url } from "inspector";
import { uriTransformer as baseUriTransformer } from 'react-markdown';
import { DefaultSkeleton } from "../../../utils/tsxUtils";


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
        if (!docu) return DefaultSkeleton;

        return <div className='topicDocumentation'>
            <ReactMarkdown source={docu} escapeHtml={false} transformLinkUri={sanitizeUrl} />
        </div>
    }
}
