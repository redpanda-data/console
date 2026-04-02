/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { computeTranslateExtent } from './pipeline-flow-diagram';

function makeNode(x: number, y: number, w: number, h: number): Node {
  return { id: `n-${x}-${y}`, position: { x, y }, data: {}, width: w, height: h };
}

describe('computeTranslateExtent', () => {
  it('clamps max extent to container width when content fits', () => {
    const nodes = [makeNode(0, 0, 100, 36)];
    const extent = computeTranslateExtent(nodes, 300, 600);

    expect(extent[1][0]).toBe(300);
  });

  it('extends max extent beyond container when content overflows', () => {
    // Node at x=100, width=250 → right edge at 350, +40 padding = 390 > 300
    const nodes = [makeNode(100, 0, 250, 36)];
    const extent = computeTranslateExtent(nodes, 300, 600);

    expect(extent[1][0]).toBe(390);
  });

  it('accounts for multiple nodes when computing extent', () => {
    const nodes = [makeNode(0, 0, 100, 36), makeNode(200, 50, 150, 36)];
    // Rightmost edge: 200+150=350, +40 padding = 390
    const extent = computeTranslateExtent(nodes, 300, 600);

    expect(extent[1][0]).toBe(390);
  });

  it('uses measured width when available', () => {
    const node: Node = {
      id: 'measured',
      position: { x: 0, y: 0 },
      data: {},
      width: 100,
      measured: { width: 280, height: 36 },
    };
    // measured width 280 → right edge 280, +40 padding = 320
    const extent = computeTranslateExtent([node], 300, 600);

    expect(extent[1][0]).toBe(320);
  });
});
