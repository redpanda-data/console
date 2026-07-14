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

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  decorateEdges,
  injectNodeData,
  regionGeometry,
  scopeBounds,
  selectionTargetForNode,
} from './pipeline-flow-canvas';

const edges: Edge[] = [
  { id: 'spine-a-b', source: 'a', target: 'b', type: 'flowGraphEdge', data: { insertIndex: 1 } },
  { id: 'fanout-c', source: 'b', target: 'c', type: 'flowGraphEdge', data: { tone: 'primary' } },
  { id: 'ref-a-resource-0', source: 'a', target: 'resource-0', type: 'flowGraphEdge', data: { tone: 'muted' } },
];

const refData = (decorated: Edge[]) =>
  decorated.find((e) => e.id.startsWith('ref-'))?.data as { dimmed?: boolean; emphasized?: boolean; faint?: boolean };

const scope = (...ids: string[]) => new Set(ids);

describe('scopeBounds — body bounds plus the entry marker', () => {
  const node = (id: string, x: number, y: number, type = 'flowCard'): Node => ({
    id,
    position: { x, y },
    initialWidth: 200,
    initialHeight: 80,
    data: {},
    type,
  });
  const noMeasure = new Map<string, { measured?: { width?: number; height?: number } }>();

  it('keeps everything but the entry marker in the body (the join stays inside)', () => {
    // Marker (col 0, the entry) fans to two outputs (col 1) and reconverges at a join (col 2). Only
    // the marker is the entry; the outputs AND the join are body, so the box covers them all.
    const marker = node('marker', 0, 300, 'flowSplit');
    const out1 = node('out1', 500, 0);
    const out2 = node('out2', 500, 600);
    const join = node('join', 1000, 300, 'flowMerge');
    const geom = scopeBounds(
      [marker, out1, out2, join],
      scope('marker', 'out1', 'out2', 'join'),
      noMeasure,
      (n) => n.id === 'marker'
    );
    expect(geom?.body).toEqual({ minX: 500, minY: 0, maxX: 1200, maxY: 680 }); // outputs + join
    expect(geom?.entry).toEqual({ minX: 0, minY: 300, maxX: 200, maxY: 380 }); // just the entry marker
  });

  it('has a null entry when nothing is flagged', () => {
    const a = node('a', 0, 0);
    const b = node('b', 500, 300);
    const geom = scopeBounds([a, b], scope('a', 'b'), noMeasure);
    expect(geom?.body).toEqual({ minX: 0, minY: 0, maxX: 700, maxY: 380 });
    expect(geom?.entry).toBeNull();
  });

  it('ignores nodes outside the scope; returns null when the scope is only the entry', () => {
    const marker = node('marker', 0, 300, 'flowSplit');
    const outsider = node('outsider', 5000, 5000); // NOT in scope — must not stretch the bounds
    expect(scopeBounds([marker, outsider], scope('marker'), noMeasure)?.body).toEqual({
      minX: 0,
      minY: 300,
      maxX: 200,
      maxY: 380,
    });
    // Only the entry marker is in scope → no body → null.
    expect(scopeBounds([marker, outsider], scope('marker'), noMeasure, (n) => n.id === 'marker')).toBeNull();
    expect(scopeBounds([marker, outsider], scope('nope'), noMeasure)).toBeNull();
  });
});

describe('regionGeometry — the arm reaches the entry marker', () => {
  const body = { minX: 500, minY: 300, maxX: 700, maxY: 480 };

  it('wraps a same-row marker with a thin arm clamped to the body height', () => {
    const marker = { minX: 0, minY: 340, maxX: 200, maxY: 420 }; // within the body's rows
    const { rects } = regionGeometry(body, marker, 6, 6);
    expect(rects).toHaveLength(2); // padded body + one arm
    const arm = rects[1];
    expect(arm.maxX).toBe(body.minX - 6); // arm abuts the padded body's left edge
    expect(arm.minY).toBeGreaterThanOrEqual(body.minY - 6);
    expect(arm.maxY).toBeLessThanOrEqual(body.maxY + 6);
  });

  it('stretches the arm up to meet the body when the marker sits clear above it (try/catch)', () => {
    const marker = { minX: 0, minY: 100, maxX: 200, maxY: 180 }; // fully above the body
    const { rects } = regionGeometry(body, marker, 6, 6);
    const arm = rects[1];
    // The arm covers the marker's row AND reaches down to the padded body top, so they connect.
    expect(arm.minY).toBe(marker.minY - 6);
    expect(arm.maxY).toBe(body.minY - 6);
  });
});

describe('decorateEdges', () => {
  it('keeps resource-reference edges faint until an endpoint is selected or hovered', () => {
    // Reference edges never fully dim: even with an unrelated node selected they stay faint
    // (a visible hint) rather than vanishing like dimmed flow edges.
    expect(refData(decorateEdges(edges, {}))).toMatchObject({ faint: true });
    expect(refData(decorateEdges(edges, { selectedScope: scope('b') }))).toMatchObject({ faint: true });

    // Selecting (or hovering) either endpoint renders the edge full-strength.
    expect(refData(decorateEdges(edges, { selectedScope: scope('a') }))).toMatchObject({
      faint: false,
      emphasized: true,
    });
    expect(refData(decorateEdges(edges, { hoveredScope: scope('a') }))).toMatchObject({
      faint: false,
      emphasized: true,
    });

    // Selecting the resource itself reveals who uses it.
    expect(refData(decorateEdges(edges, { selectedScope: scope('resource-0') }))).toMatchObject({ emphasized: true });
  });

  it('hover alone does not dim unrelated edges (only selection does)', () => {
    const hovered = decorateEdges(edges, { hoveredScope: scope('a') });
    expect((hovered.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean }).dimmed).toBeUndefined();
  });

  it('dims unrelated edges and emphasizes connected ones while a node is selected', () => {
    const decorated = decorateEdges(edges, { selectedScope: scope('a') });
    const spine = decorated.find((e) => e.id === 'spine-a-b')?.data as { dimmed?: boolean; emphasized?: boolean };
    const fanout = decorated.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean; emphasized?: boolean };
    expect(spine.emphasized).toBe(true);
    expect(spine.dimmed).toBe(false);
    expect(fanout.dimmed).toBe(true);

    // No selection → no dimming anywhere.
    const plain = decorateEdges(edges, {});
    expect((plain.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean }).dimmed).toBeUndefined();
  });

  it("keeps a selected container's internal wiring lit (scope includes descendants)", () => {
    // Selecting container 'a' (subtree includes 'b','c'): the fan edge between its children must
    // stay lit, not dim as "unrelated".
    const decorated = decorateEdges(edges, { selectedScope: scope('a', 'b', 'c') });
    const fanout = decorated.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean; emphasized?: boolean };
    expect(fanout.emphasized).toBe(true);
    expect(fanout.dimmed).toBe(false);
  });

  it('wires the insert handler onto spine edges with their processor index', () => {
    const onInsert = vi.fn();
    const decorated = decorateEdges(edges, { onInsert });
    const spineData = decorated.find((e) => e.type === 'flowGraphEdge')?.data as { onInsert?: () => void };
    spineData.onInsert?.();
    expect(onInsert).toHaveBeenCalledWith(1);
  });
});

describe('selectionTargetForNode', () => {
  const switchNode: Node = {
    id: 'proc-0',
    position: { x: 0, y: 0 },
    data: { label: 'switch', editTarget: { kind: 'processor', index: 0 } },
  };
  const caseNode: Node = {
    id: 'proc-0-case-1',
    parentId: 'proc-0',
    position: { x: 0, y: 0 },
    data: { label: 'case 1', isCase: true }, // no editTarget
  };

  it('selects an editable node directly', () => {
    expect(selectionTargetForNode(switchNode, [switchNode, caseNode])).toEqual({
      id: 'proc-0',
      target: { kind: 'processor', index: 0 },
    });
  });

  it('walks up from a structural node (no editTarget) to select its parent', () => {
    expect(selectionTargetForNode(caseNode, [switchNode, caseNode])).toEqual({
      id: 'proc-0',
      target: { kind: 'processor', index: 0 },
    });
  });

  it('selects a switch case directly when it carries a switchCase editTarget', () => {
    const editableCase: Node = {
      id: 'proc-0-case-1',
      parentId: 'proc-0',
      position: { x: 0, y: 0 },
      data: {
        label: 'case 1',
        isCase: true,
        editTarget: { kind: 'switchCase', path: ['pipeline', 'processors', 0, 'switch', 0] },
      },
    };
    expect(selectionTargetForNode(editableCase, [switchNode, editableCase])).toEqual({
      id: 'proc-0-case-1',
      target: { kind: 'switchCase', path: ['pipeline', 'processors', 0, 'switch', 0] },
    });
  });

  it('returns null when no ancestor is selectable', () => {
    const orphan: Node = { id: 'x', position: { x: 0, y: 0 }, data: { label: 'x' } };
    expect(selectionTargetForNode(orphan, [orphan])).toBeNull();
  });
});

describe('injectNodeData — appearance', () => {
  const node: Node = {
    id: 'child-1',
    position: { x: 0, y: 0 },
    data: { label: 'http' },
    style: { transition: 'transform 200ms ease' },
  };
  const base = { collapsedIds: new Set<string>(), toggleCollapse: () => undefined };

  it('marks a node new this render as appeared and drops its reposition transition', () => {
    // Empty previousIds → the node is appearing (e.g. revealed by expanding).
    const injected = injectNodeData(node, { ...base, previousIds: new Set() });
    expect((injected.data as { appeared?: boolean }).appeared).toBe(true);
    // No transform transition, so it snaps to its spot instead of flying from origin.
    expect((injected.style as { transition?: string }).transition).toBeUndefined();
  });

  it('leaves an existing node untouched (smooth reposition transition kept)', () => {
    const injected = injectNodeData(node, { ...base, previousIds: new Set(['child-1']) });
    expect((injected.data as { appeared?: boolean }).appeared).toBeUndefined();
    expect((injected.style as { transition?: string }).transition).toBe('transform 200ms ease');
  });

  it('flags a node as unsaved when its id is in unsavedNodeIds', () => {
    const unsaved = injectNodeData(node, {
      ...base,
      previousIds: new Set(['child-1']),
      unsavedNodeIds: new Set(['child-1']),
    });
    expect((unsaved.data as { unsaved?: boolean }).unsaved).toBe(true);
    const clean = injectNodeData(node, {
      ...base,
      previousIds: new Set(['child-1']),
      unsavedNodeIds: new Set(['other']),
    });
    expect((clean.data as { unsaved?: boolean }).unsaved).toBeUndefined();
  });
});
