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

import React from 'react';

import styles from './BoxCard.module.scss';

export type BoxCardProps = {
  id?: string;
  borderStyle?: 'solid' | 'dashed';
  borderWidth?: 'thin' | 'medium';
  hoverable?: boolean;
  active?: boolean;
  children?: React.ReactNode;
};

export default function BoxCard({
  id,
  borderStyle = 'solid',
  borderWidth = 'thin',
  hoverable = true,
  active = false,
  children,
}: BoxCardProps) {
  const classes = [styles.boxCard];

  if (borderStyle === 'dashed') {
    classes.push(styles.dashed);
  }
  if (borderWidth === 'medium') {
    classes.push(styles.medium);
  }
  if (hoverable) {
    classes.push(styles.hoverable);
  }
  if (active) {
    classes.push(styles.active);
  }

  return (
    <div className={classes.join(' ')} id={id}>
      {children}
    </div>
  );
}
