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

import { Center, Heading, Image, Stack } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';

import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';

type NotFoundContentProps = {
  /** The type of resource that wasn't found (e.g., "AI Agent", "Shadow Link") */
  resourceType: string;
  /** The ID or name of the resource that wasn't found */
  resourceId?: string;
  /** The link to navigate back to (e.g., "/agents") */
  backLink?: string;
  /** The text for the back link (e.g., "Back to AI Agents") */
  backLinkText?: string;
};

/**
 * Reusable component for displaying resource-specific 404 pages.
 * Used by route notFoundComponent handlers when a specific resource is not found.
 */
export const NotFoundContent = ({ resourceType, resourceId, backLink, backLinkText }: NotFoundContentProps) => {
  const message = resourceId ? `${resourceType} "${resourceId}" not found.` : `${resourceType} not found.`;

  return (
    <Center data-testid="not-found-content" h="80vh">
      <Stack spacing={4} textAlign="center">
        <Image alt="Error" height="180px" src={errorBananaSlip} />
        <Heading as="h1" fontSize={32} variant="lg">
          {message}
        </Heading>
        {backLink ? (
          <Link className="text-base underline" data-testid="back-link" to={backLink}>
            {backLinkText ?? 'Go back'}
          </Link>
        ) : null}
      </Stack>
    </Center>
  );
};
