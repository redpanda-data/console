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

import { GitHubIcon, SlackIcon, TwitterIcon } from 'components/icons';
import { ElementTooltip } from 'components/misc/element-tooltip';

import { isEmbedded } from '../../config';
import env, { getBuildDate, IsCI, IsDev } from '../../utils/env';

export const VersionInfo = () => {
  const appName = 'Redpanda Console';
  const mode = getBuildMode();

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

// Bottom placement is CSS: `.footer` has `margin-top: auto` inside #mainLayout's flex column.
export const AppFooter = () => {
  // Icon `<title>`s are emptied: the link carries the name, and a native tooltip would stack on the Registry one.
  const gitHub = (link: string, title: string) => (
    <ElementTooltip content={title}>
      <a aria-label={title} href={link} rel="noopener noreferrer" target="_blank">
        <GitHubIcon aria-hidden size={16} title="" />
      </a>
    </ElementTooltip>
  );

  return (
    <footer className="footer">
      {/* Social Media Links */}
      <div className="links">
        {isEmbedded()
          ? gitHub('https://github.com/redpanda-data/redpanda', "Visit Redpanda's GitHub repository")
          : gitHub('https://github.com/redpanda-data/console', "Visit Redpanda Console's GitHub repository")}
        <ElementTooltip content="Slack">
          <a aria-label="Slack" href="https://redpanda.com/slack" rel="noopener noreferrer" target="_blank">
            <SlackIcon aria-hidden size={16} title="" />
          </a>
        </ElementTooltip>
        <ElementTooltip content="Twitter">
          <a aria-label="Twitter" href="https://twitter.com/redpandadata" rel="noopener noreferrer" target="_blank">
            <TwitterIcon aria-hidden size={16} title="" />
          </a>
        </ElementTooltip>
      </div>

      {/* Version Info */}
      <div className="versionText">
        <VersionInfo />
      </div>
    </footer>
  );
};

export default AppFooter;

function getBuildMode() {
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
  return mode;
}
