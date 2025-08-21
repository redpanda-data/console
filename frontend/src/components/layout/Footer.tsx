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

import { FaGithub, FaLinkedin, FaSlack, FaTwitter } from 'react-icons/fa';

import { isEmbedded } from '../../config';
import env, { getBuildDate, IsCI, IsDev } from '../../utils/env';

export const VersionInfo = () => {
  const appName = 'Redpanda Console';
  let mode = '';
  if (IsDev) mode = ' - DEV';
  if (IsCI) mode = ' - CI';

  if (env.REACT_APP_CONSOLE_PLATFORM_VERSION) mode += ` (Platform Version ${env.REACT_APP_CONSOLE_PLATFORM_VERSION})`;

  let ref = env.REACT_APP_CONSOLE_GIT_REF;
  if (!ref || ref === 'master') ref = '';

  const sha = IsDev ? '<no git sha in dev>' : env.REACT_APP_CONSOLE_GIT_SHA.slice(0, 7);

  const buildDate = IsDev ? new Date() : getBuildDate();

  return (
    <>
      <div data-testid="versionTitle" className="versionTitle">
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
  const gitHub = (link: string, title: string) => (
    <>
      <a href={link} title={title} target="_blank" rel="noopener noreferrer">
        <FaGithub />
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
        <a href="https://redpanda.com/slack" title="Slack" target="_blank" rel="noopener noreferrer">
          <FaSlack />
        </a>
        <a href="https://twitter.com/redpandadata" title="Twitter" target="_blank" rel="noopener noreferrer">
          <FaTwitter />
        </a>
        <a
          href="https://www.linkedin.com/company/redpanda-data"
          title="LinkedIn"
          target="_blank"
          rel="noopener noreferrer"
        >
          <FaLinkedin />
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
