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

import { GithubFilled, LinkedinFilled, SlackSquareOutlined, TwitterOutlined } from '@ant-design/icons';
import { Footer } from 'antd/lib/layout/layout';
import { isEmbedded } from '../../config';
import env, { getBuildDate, IsCI, IsDev } from '../../utils/env';

export const VersionInfo = () => {
    const appName = 'Redpanda Console';
    let mode = '';
    if (IsDev) mode = ' - DEV';
    if (IsCI) mode = ' - CI';

    if (env.NEXT_PUBLIC_CONSOLE_PLATFORM_VERSION)
        mode += ` (Platform Version ${env.NEXT_PUBLIC_CONSOLE_PLATFORM_VERSION})`;

    let ref = env.NEXT_PUBLIC_CONSOLE_GIT_REF;
    if (!ref || ref == 'master') ref = '';

    const sha = IsDev
        ? '<no git sha in dev>'
        : env.NEXT_PUBLIC_CONSOLE_GIT_SHA.slice(0, 7);

    const buildDate = IsDev
        ? new Date()
        : getBuildDate();

    return <>
        <div className="versionTitle">{appName} {mode}</div>
        <div className="versionDate">(built {buildDate?.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })})</div>
        <div className="versionGitData">{ref} {sha}</div>
    </>;
};

export const AppFooter = () => {
    const gitHub = (link: string, title: string) => <>
        <a href={link} title={title} target="_blank" rel="noopener noreferrer">
            <GithubFilled />
        </a>
    </>;

    return <Footer className="footer">
        {/* Social Media Links */}
        <div className="links">
            {isEmbedded() ? gitHub('https://github.com/redpanda-data/redpanda', 'Visit Redpanda\'s GitHub repository') :
                gitHub('https://github.com/redpanda-data/console', 'Visit Redpanda Console\'s GitHub repository')}
            <a href="https://redpanda.com/slack" title="Slack" target="_blank" rel="noopener noreferrer">
                <SlackSquareOutlined />
            </a>
            <a href="https://twitter.com/redpandadata" title="Twitter" target="_blank" rel="noopener noreferrer">
                <TwitterOutlined />
            </a>
            <a href="https://www.linkedin.com/company/redpanda-data" title="LinkedIn" target="_blank" rel="noopener noreferrer">
                <LinkedinFilled />
            </a>
        </div>

        {/* Version Info */}
        <div className="versionText">
            <VersionInfo />
        </div>
    </Footer>;
};

export default AppFooter;
