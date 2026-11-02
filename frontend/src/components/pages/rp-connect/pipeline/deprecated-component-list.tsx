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

import { type DeprecatedUsage, deprecationMessage } from '../utils/deprecation';

/** The YAML lane's list of deprecated components in use, under its lint issues. */
export const DeprecatedComponentList = ({ usages }: { usages: DeprecatedUsage[] }) =>
  usages.length > 0 ? (
    <div className="mt-4 flex flex-col gap-2" data-testid="deprecated-component-list">
      <h5 className="text-heading-xs text-muted-foreground">Deprecated components</h5>
      <ul className="flex flex-col gap-2">
        {usages.map(({ notice, range }) => (
          <li className="flex items-start gap-2 text-body-sm" key={`${range.startLineNumber}:${range.startColumn}`}>
            <TonedIcon className="mt-0.5 size-3.5 shrink-0" icon={TriangleAlert} tone="warning" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>
                <span className="text-muted-foreground">Line {range.startLineNumber}: </span>
                {deprecationMessage(notice)}
              </span>
              {notice.docsUrl ? (
                <Link
                  className="inline-flex items-center"
                  href={notice.docsUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {notice.replacement ? `View ${notice.replacement.name} docs` : 'View documentation'}
                  <ExternalLink className="ml-1 size-3.5" />
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
