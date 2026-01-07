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

import { GitHubIcon, LinkedInIcon, SlackIcon, TwitterIcon } from 'components/icons';
import { useLocation, useMatch } from 'react-router-dom';

import { isEmbedded } from '../../config';
import env, { getBuildDate, IsCI, IsDev } from '../../utils/env';

export const VersionInfo = () => {
  const appName = 'Redpanda Console';
  let mode = '';
  if (IsDev) {
    mode = ' - DEV';
  }
  if (IsCI) {
    mode = ' - CI';
  }

  if (env.REACT_APP_CONSOLE_PLATFORM_VERSION) {
    mode += ` (Platform Version ${env.REACT_APP_CONSOLE_PLATFORM_VERSION})`;
  }

  let ref = env.REACT_APP_CONSOLE_GIT_REF;
  if (!ref || ref === 'master') {
    ref = '';
  }

  const GIT_SHA_SHORT_LENGTH = 7;
  const sha = IsDev ? '<no git sha in dev>' : env.REACT_APP_CONSOLE_GIT_SHA.slice(0, GIT_SHA_SHORT_LENGTH);

  const buildDate = IsDev ? new Date() : getBuildDate();

  return (
    <>
      <div className="versionTitle" data-testid="versionTitle">
        {appName} {mode}
      </div>
      <div className="versionDate">
        (built {buildDate?.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })})
      </div>
      <div className="versionGitData">
        {ref} {sha}
      </div>
    </>
  );
};

export const AppFooter = () => {
  const location = useLocation();
  const isAgentPage = useMatch('/agents/:agentId');

  // Hide footer on AI agent inspector tab
  if (isAgentPage) {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('tab') === 'inspector') {
      return null;
    }
  }

  const gitHub = (link: string, title: string) => (
    <>
      <a href={link} rel="noopener noreferrer" target="_blank" title={title}>
        <GitHubIcon size={16} />
      </a>
    </>
  );

  return (
    <footer className="footer">
      {/* Social Media Links */}
      <div className="links">
        {isEmbedded()
          ? gitHub('https://github.com/redpanda-data/redpanda', "Visit Redpanda's GitHub repository")
          : gitHub('https://github.com/redpanda-data/console', "Visit Redpanda Console's GitHub repository")}
        <a href="https://redpanda.com/slack" rel="noopener noreferrer" target="_blank" title="Slack">
          <SlackIcon size={16} />
        </a>
        <a href="https://twitter.com/redpandadata" rel="noopener noreferrer" target="_blank" title="Twitter">
          <TwitterIcon size={16} />
        </a>
        <a
          href="https://www.linkedin.com/company/redpanda-data"
          rel="noopener noreferrer"
          target="_blank"
          title="LinkedIn"
        >
          <LinkedInIcon size={16} />
        </a>
      </div>

      {/* Version Info */}
      <div className="versionText">
        <VersionInfo />
      </div>
    </footer>
  );
};

export default AppFooter;
