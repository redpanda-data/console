/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Link as RouterLink } from '@tanstack/react-router';
import { Link } from 'components/redpanda-ui/components/typography';

import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';

type NotFoundContentProps = {
  /** The type of resource that wasn't found (for example, "Shadow Link") */
  resourceType: string;
  /** The ID or name of the resource that wasn't found */
  resourceId?: string;
  /** The link to navigate back to (for example, "/shadowlinks") */
  backLink?: string;
  /** The text for the back link (for example, "Back to Shadow Links") */
  backLinkText?: string;
};

/**
 * Reusable component for displaying resource-specific 404 pages.
 * Used by route notFoundComponent handlers when a specific resource is not found.
 */
export const NotFoundContent = ({ resourceType, resourceId, backLink, backLinkText }: NotFoundContentProps) => {
  const message = resourceId ? `${resourceType} "${resourceId}" not found.` : `${resourceType} not found.`;

  return (
    <div className="flex h-[80vh] items-center justify-center" data-testid="not-found-content">
      <div className="flex flex-col items-center gap-4 text-center">
        <img alt="Error" className="h-[180px]" src={errorBananaSlip} />
        <h1 className="text-heading-xl font-semibold">{message}</h1>
        {backLink ? (
          <Link as={RouterLink} data-testid="back-link" to={backLink}>
            {backLinkText ?? 'Go back'}
          </Link>
        ) : null}
      </div>
    </div>
  );
};
