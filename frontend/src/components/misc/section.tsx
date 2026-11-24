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

import { Card, type CardProps } from 'components/redpanda-ui/components/card';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { CSSProperties } from 'react';

type SectionProps = Pick<CardProps, 'children' | 'id' | 'className' | 'ref'> & {
  padding?: 'compact' | 'normal';
  style?: Pick<CSSProperties, 'gridArea'>;
};

function Section({ children, id, className, style, padding = 'normal', ref }: SectionProps) {
  return (
    <Card
      className={cn('block max-w-none', className)}
      id={id}
      ref={ref}
      size={padding === 'compact' ? 'sm' : 'full'}
      style={style}
    >
      {children}
    </Card>
  );
}

export default Section;
