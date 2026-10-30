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

import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Link } from 'components/redpanda-ui/components/typography';
import { ExternalLink, TriangleAlert } from 'lucide-react';

import type { DeprecatedUsage, DeprecationNotice } from '../utils/deprecation';

/** The `deprecationMessage` wording, with component names in mono. */
export const DeprecationText = ({ notice }: { notice: DeprecationNotice }) => {
  const { name, replacement } = notice;
  const nameNode = <span className="font-mono">{name}</span>;
  if (!replacement) {
    return <>{nameNode} is deprecated and may be removed in a future release.</>;
  }
  return (
    <>
      {nameNode} is deprecated. Use the <span className="font-mono">{replacement.name}</span>{' '}
      {replacement.type.replace(/_/g, ' ')} instead.
    </>
  );
};

/** Opens the replacement's docs, or the deprecated component's own when there is no replacement. */
export const DeprecationDocsLink = ({ notice }: { notice: DeprecationNotice }) =>
  notice.docsUrl ? (
    <Link className="inline-flex items-center" href={notice.docsUrl} rel="noopener noreferrer" target="_blank">
      {notice.replacement ? (
        <>
          View <span className="mx-1 font-mono">{notice.replacement.name}</span> docs
        </>
      ) : (
        'View documentation'
      )}
      <ExternalLink className="ml-1 size-3.5" />
    </Link>
  ) : null;

/** The YAML lane's list of deprecated components in use, under its lint issues. */
export const DeprecatedComponentList = ({ usages }: { usages: DeprecatedUsage[] }) =>
  usages.length > 0 ? (
    <div className="mt-4 flex flex-col gap-2" data-testid="deprecated-component-list">
      <h5 className="text-heading-xs text-muted-foreground">Deprecated components</h5>
      <ul className="flex flex-col gap-2">
        {usages.map(({ nodeId, notice, range }) => (
          <li className="flex items-start gap-2 text-body-sm" key={nodeId}>
            <TonedIcon className="mt-0.5 size-3.5 shrink-0" icon={TriangleAlert} tone="warning" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>
                <span className="text-muted-foreground">Line {range.startLineNumber}: </span>
                <DeprecationText notice={notice} />
              </span>
              <DeprecationDocsLink notice={notice} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
