import { Component } from "react";
import { Topic } from "../../../state/restInterfaces";
import "../../../utils/arrayExtensions";
import { api } from "../../../state/backendApi";
import ReactMarkdown from 'react-markdown';
import gfm from 'remark-gfm'
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
            <ReactMarkdown remarkPlugins={[gfm]} children={markdown} skipHtml={false} transformLinkUri={sanitizeUrl} />
        </div>
    }
}

const errorNotConfigured = renderDocuError('Not Configured', <>
    <p>Topic Documentation is not configured in Kowl.</p>
    <p>Provide the connection credentials in the Kowl config, to fetch and display docmentation for the topics.</p>
</>);
const errorNotFound = renderDocuError('Not Found', <>
    <p>No documentation file was found for this topic.</p>
    <ul style={{ listStyle: 'none' }}>
        <li>Ensure the Git connection to the documentation repository is configured correctly in the Kowl backend.</li>
        <li>Ensure that a markdown file (named just like the topic) exists in the repository.</li>
    </ul>
</>);
const errorEmpty = renderDocuError('Empty', <>
    <p>The documentation file is empty.</p>
    <p>In case you just changed the file, keep in mind that Kowl will only<br />
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
                <a target="_blank" rel="noopener noreferrer" href="https://github.com/cloudhut/kowl/blob/master/docs/config/kowl.yaml">
                    <Button type="primary">Kowl Documentation</Button>
                </a>
            </Empty>
        </motion.div>
    );
}