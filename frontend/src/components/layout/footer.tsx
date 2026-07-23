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

import { useLocation, useMatchRoute } from '@tanstack/react-router';
import { GitHubIcon, SlackIcon, TwitterIcon } from 'components/icons';
import { useLayoutEffect, useRef } from 'react';

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

/** Distance from the document top to the element, scroll-independent. */
const measureDocumentTop = (target: HTMLElement): number => {
  let top = 0;
  for (let el: HTMLElement | null = target; el; ) {
    top += el.offsetTop;
    el = el.offsetParent instanceof HTMLElement ? el.offsetParent : null;
  }
  return top;
};

/** Space the ancestors (up to and including <body>) keep below the element. */
const measureReservedBelow = (target: HTMLElement): number => {
  let reserved = 0;
  for (let el: HTMLElement | null = target; el && el !== document.documentElement; el = el.parentElement) {
    const style = getComputedStyle(el);
    reserved += Number.parseFloat(style.marginBottom) || 0;
    if (el !== target) {
      reserved += (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
    }
  }
  return reserved;
};

/**
 * Stretch the layout to the viewport bottom so the footer's `margin-top: auto` pins it
 * there on short pages. Measured rather than expressed as a CSS flex chain because in
 * embedded mode the wrappers above `#mainLayout` belong to the host app.
 */
const stretchLayoutToViewportBottom = (layoutEl: HTMLElement) => {
  const viewportHeight = document.documentElement.clientHeight;
  const minHeight = Math.round(viewportHeight - measureDocumentTop(layoutEl) - measureReservedBelow(layoutEl));
  const value = minHeight > 0 ? `${minHeight}px` : '';
  if (layoutEl.style.minHeight !== value) {
    layoutEl.style.minHeight = value;
  }
};

/** Pins the footer to the viewport bottom on short pages by stretching `#mainLayout`. */
const useBottomPinnedFooter = (hidden: boolean) => {
  const footerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const layoutEl = hidden ? null : footerRef.current?.closest<HTMLElement>('#mainLayout');
    if (!layoutEl) {
      return;
    }

    const update = () => stretchLayoutToViewportBottom(layoutEl);

    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    observer.observe(layoutEl);
    // The layout's margins are adjusted after mount in embedded mode (useCancelHostGutters);
    // the MutationObserver re-measures on that style write. update() is idempotent.
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(layoutEl, { attributeFilter: ['style'], attributes: true });
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', update);
      layoutEl.style.minHeight = '';
    };
  }, [hidden]);

  return footerRef;
};

export const AppFooter = () => {
  const location = useLocation();
  const matchRoute = useMatchRoute();
  const isAgentPage = matchRoute({ to: '/agents/$id' });

  // Hide footer on AI agent inspector tab
  let hidden = false;
  if (isAgentPage) {
    const searchParams = new URLSearchParams(location.searchStr ?? '');
    hidden = searchParams.get('tab') === 'inspector';
  }

  const footerRef = useBottomPinnedFooter(hidden);

  if (hidden) {
    return null;
  }

  const gitHub = (link: string, title: string) => (
    <>
      <a href={link} rel="noopener noreferrer" target="_blank" title={title}>
        <GitHubIcon size={16} />
      </a>
    </>
  );

  return (
    <footer className="footer" ref={footerRef}>
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
      </div>

      {/* Version Info */}
      <div className="versionText">
        <VersionInfo />
      </div>
    </footer>
  );
};

export default AppFooter;
