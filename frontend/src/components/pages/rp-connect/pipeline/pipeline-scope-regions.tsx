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

import { useStore, ViewportPortal } from '@xyflow/react';
import { memo, useMemo } from 'react';

import type { ScopeBounds } from './canvas-controls';
import { sectionAccent } from './pipeline-flow-canvas-nodes';
import type { PipelineStyle } from './pipeline-style';
import type { FlowNode as Node } from '../utils/pipeline-flow-layout';
import './pipeline-editor.css';

// In scope if it's a member by id, or carries the construct's id as `ownerId` (marks outside the parser tree).
export function nodeInScope(node: Node, scope: ReadonlySet<string>): boolean {
  return scope.has(node.id) || scope.has(node.data.ownerId ?? ' ');
}

// Padding (px) between a construct's members and the region edge; extra per nesting level so outer regions stand off.
const SCOPE_REGION_PAD = 6;
const SCOPE_REGION_TOP_PAD = 6;
const SCOPE_REGION_NEST_STEP = 4;

// The accent for a construct node; error/dead-letter paths (catch) get a distinct tone.
function constructAccent(node?: Node): string {
  const d = node?.data;
  return d?.isErrorPath === true ? 'var(--color-destructive)' : (sectionAccent(d?.section) ?? 'var(--color-primary)');
}
type Point = { x: number; y: number };
export type MeasuredById = Map<string, { measured?: { width?: number; height?: number } }>;
// One rectangle over the `body` members; the `entry` marker sits outside, reached by an arm (see regionGeometry).
type ScopeGeometry = { body: ScopeBounds; entry: ScopeBounds | null };

export function nodeRect(n: Node, measuredById: MeasuredById): ScopeBounds {
  const m = measuredById.get(n.id)?.measured;
  const w = m?.width ?? n.initialWidth ?? n.width ?? 0;
  const h = m?.height ?? n.initialHeight ?? n.height ?? 0;
  return { minX: n.position.x, minY: n.position.y, maxX: n.position.x + w, maxY: n.position.y + h };
}

export const growBounds = (box: ScopeBounds | null, r: ScopeBounds): ScopeBounds =>
  box
    ? {
        minX: Math.min(box.minX, r.minX),
        minY: Math.min(box.minY, r.minY),
        maxX: Math.max(box.maxX, r.maxX),
        maxY: Math.max(box.maxY, r.maxY),
      }
    : r;

// Split a construct's scoped members into the body (everything but the entry marker) and the entry
// marker's own rect. Prefers measured size, falling back to layout size. Null when there's no body.
export function scopeBounds(
  nodes: Node[],
  scope: ReadonlySet<string>,
  measuredById: MeasuredById,
  isEntry?: (n: Node) => boolean
): ScopeGeometry | null {
  let body: ScopeBounds | null = null;
  let entry: ScopeBounds | null = null;
  for (const n of nodes) {
    if (!nodeInScope(n, scope)) {
      continue;
    }
    const r = nodeRect(n, measuredById);
    if (isEntry?.(n) === true) {
      entry = r;
    } else {
      body = growBounds(body, r);
    }
  }
  return body ? { body, entry } : null;
}

type ScopeRegion = {
  id: string;
  scope: ReadonlySet<string>;
  body: ScopeBounds;
  entry: ScopeBounds | null;
  accent: string;
  label: string;
  /** Side / top padding — larger for outer regions so nested ones don't touch. */
  pad: number;
  topPad: number;
};

// Browsers silently drop a filled div's background past ~8k–16k device px, so tall region fills are
// painted as stacked pieces capped at this. Exported so the render test can assert the cap.
export const MAX_REGION_PIECE_PX = 3000;

type RegionGeometry = {
  /** Padded body rect + optional arm rect, painted as the fill (sliced by MAX_REGION_PIECE_PX). */
  rects: ScopeBounds[];
  /** Dashed outline path in bbox-local coords: the body rectangle with an arm out to the entry. */
  path: string;
  bbox: { x: number; y: number; w: number; h: number };
  /** Body's top-left corner, where the label sits. */
  anchor: Point;
};

// A thin arm from the body edge out to the entry marker, at the marker's row.
type ScopeArm = { side: 'left' | 'right'; outerX: number; top: number; bottom: number };

// Which side of the body the entry marker sits on (undefined if it overlaps the body horizontally).
function entrySide(entry: ScopeBounds, body: ScopeBounds): 'left' | 'right' | undefined {
  return entry.maxX <= body.minX ? 'left' : entry.minX >= body.maxX ? 'right' : undefined;
}

// The arm's span at the entry marker's own row: stretched to meet the padded body `pb` when the marker
// sits clear above/below it; otherwise clamped to the body so it stays thin and can't reach into a sibling.
function armSpan(entry: ScopeBounds, pb: ScopeBounds, pad: number): { top: number; bottom: number } {
  const top = entry.minY - pad;
  const bottom = entry.maxY + pad;
  if (bottom < pb.minY) {
    return { top, bottom: pb.minY };
  }
  if (top > pb.maxY) {
    return { top: pb.maxY, bottom };
  }
  return { top: Math.max(top, pb.minY), bottom: Math.min(bottom, pb.maxY) };
}

// The arm out to the entry marker, on whichever side of the body it sits (see armSpan).
function entryArm(entry: ScopeBounds, body: ScopeBounds, pb: ScopeBounds, pad: number): ScopeArm | undefined {
  const side = entrySide(entry, body);
  if (!side) {
    return;
  }
  const { top, bottom } = armSpan(entry, pb, pad);
  return bottom > top
    ? { side, outerX: side === 'left' ? entry.minX - pad : entry.maxX + pad, top, bottom }
    : undefined;
}

// The arm's own fill rect, between the padded body's edge and the arm's outer end.
function armRect(arm: ScopeArm, pb: ScopeBounds): ScopeBounds {
  return arm.side === 'left'
    ? { minX: arm.outerX, minY: arm.top, maxX: pb.minX, maxY: arm.bottom }
    : { minX: pb.maxX, minY: arm.top, maxX: arm.outerX, maxY: arm.bottom };
}

// The body rectangle traced clockwise, poking the arm out at the entry marker's row.
function regionPath(pb: ScopeBounds, arm?: ScopeArm): Point[] {
  const pts: Point[] = [
    { x: pb.minX, y: pb.minY },
    { x: pb.maxX, y: pb.minY },
  ];
  if (arm?.side === 'right') {
    pts.push(
      { x: pb.maxX, y: arm.top },
      { x: arm.outerX, y: arm.top },
      { x: arm.outerX, y: arm.bottom },
      { x: pb.maxX, y: arm.bottom }
    );
  }
  pts.push({ x: pb.maxX, y: pb.maxY }, { x: pb.minX, y: pb.maxY });
  if (arm?.side === 'left') {
    pts.push(
      { x: pb.minX, y: arm.bottom },
      { x: arm.outerX, y: arm.bottom },
      { x: arm.outerX, y: arm.top },
      { x: pb.minX, y: arm.top }
    );
  }
  return pts;
}

// A padded body rectangle plus a thin arm out to the entry marker, so it reads as part of the area
// while the box stays clear of whatever shares the marker's column.
export function regionGeometry(
  body: ScopeBounds,
  entry: ScopeBounds | null,
  pad: number,
  topPad: number
): RegionGeometry {
  const pb = { minX: body.minX - pad, minY: body.minY - topPad, maxX: body.maxX + pad, maxY: body.maxY + pad };
  const arm = entry ? entryArm(entry, body, pb, pad) : undefined;
  const rects: ScopeBounds[] = arm ? [pb, armRect(arm, pb)] : [pb];
  const outer = rects.reduce(growBounds);
  const path = `M${regionPath(pb, arm)
    .map((p) => `${p.x - outer.minX} ${p.y - outer.minY}`)
    .join('L')}Z`;
  return {
    rects,
    path,
    bbox: { x: outer.minX, y: outer.minY, w: outer.maxX - outer.minX, h: outer.maxY - outer.minY },
    anchor: { x: pb.minX, y: pb.minY },
  };
}

// One construct's enclosure: a faint dashed rect + arm to the entry marker; strengthens when the
// construct (or anything inside) is active. Non-interactive, behind the nodes, in flow coordinates.
const RegionBox = memo(({ region, active }: { region: ScopeRegion; active: boolean }) => {
  const { body, entry, accent, label, pad, topPad } = region;
  const borderColor = `color-mix(in srgb, ${accent} ${active ? 70 : 32}%, transparent)`;
  // Geometry is `active`-independent, so hover (colour only) doesn't recompute it.
  const { rects, path, bbox, anchor } = useMemo(
    () => regionGeometry(body, entry, pad, topPad),
    [body, entry, pad, topPad]
  );

  const borderStyle: PipelineStyle = { '--pipeline-region-x': `${bbox.x}px`, '--pipeline-region-y': `${bbox.y}px` };
  const anchorStyle: PipelineStyle = { '--pipeline-region-x': `${anchor.x}px`, '--pipeline-region-y': `${anchor.y}px` };
  const labelStyle: PipelineStyle = {
    '--pipeline-region-accent': accent,
    '--pipeline-region-label-opacity': active ? 1 : 0.8,
    '--pipeline-region-label-border-opacity': active ? 55 : 32,
  };
  return (
    <>
      {/* Fill in height-capped pieces so a tall area never exceeds the browser paint limit (see MAX_REGION_PIECE_PX). */}
      {rects.flatMap((r) => {
        const width = r.maxX - r.minX;
        const height = r.maxY - r.minY;
        const pieceCount = Math.max(1, Math.ceil(height / MAX_REGION_PIECE_PX));
        const pieceHeight = height / pieceCount;
        return Array.from({ length: pieceCount }, (_, p) => {
          const topY = r.minY + p * pieceHeight;
          const pieceStyle: PipelineStyle = {
            '--pipeline-region-x': `${r.minX}px`,
            '--pipeline-region-y': `${topY}px`,
            '--pipeline-region-width': `${width}px`,
            '--pipeline-region-height': `${pieceHeight}px`,
            '--pipeline-region-accent': accent,
            '--pipeline-region-fill-opacity': active ? 10 : 5,
          };
          return (
            <div
              className="pipeline-region-fill pointer-events-none absolute transition-colors duration-200"
              data-region-fill="true"
              key={`${r.minX}-${topY}`}
              style={pieceStyle}
            />
          );
        });
      })}
      {/* Dashed border as one path — no per-piece seams. */}
      <svg
        aria-hidden="true"
        className="pipeline-region-border pointer-events-none absolute"
        height={bbox.h}
        style={borderStyle}
        width={bbox.w}
      >
        <path
          className="pipeline-region-path"
          d={path}
          fill="none"
          stroke={borderColor}
          strokeDasharray="4 4"
          strokeLinejoin="round"
          strokeWidth={1}
        />
      </svg>
      <div className="pipeline-region-position pointer-events-none absolute" style={anchorStyle}>
        <span
          className="pipeline-region-label absolute bottom-full left-2 mb-0.5 rounded px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase transition-opacity duration-200"
          style={labelStyle}
        >
          {label}
        </span>
      </div>
    </>
  );
});

type ScopeRegionDraft = Omit<ScopeRegion, 'pad' | 'topPad'>;
type RegionContext = {
  rfNodes: Node[];
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined;
  nodeLookup: MeasuredById;
  /** try marker id → its fused catch marker id, so a try's area also covers its error handling. */
  tryCatchPairs: ReadonlyMap<string, string>;
};

// One construct's region (before nesting padding). Only the entry marker is held outside (reached by
// an arm); everything else — branches, the merge/join, and a try's fused catch — is in the body.
function scopeRegionDraft(node: Node, ctx: RegionContext): ScopeRegionDraft | null {
  const { rfNodes, scopeOf, nodeLookup, tryCatchPairs } = ctx;
  const own = scopeOf(node.id);
  if (!own || own.size < 2) {
    return null;
  }
  const catchId = tryCatchPairs.get(node.id);
  const scope =
    catchId !== null && catchId !== undefined && catchId !== '' ? new Set([...own, ...(scopeOf(catchId) ?? [])]) : own;
  const geom = scopeBounds(rfNodes, scope, nodeLookup, (n) => n.id === node.id);
  if (!geom) {
    return null;
  }
  return {
    id: node.id,
    scope,
    body: geom.body,
    entry: geom.entry,
    accent: constructAccent(node),
    label: node.data.label,
  };
}

// Faint enclosure boxes around each construct's sub-graph, emphasized when it (or anything inside) is
// active. Drawn via `ViewportPortal` (hover stays cheap); a box may span a scattered non-member card.
export function ScopeRegions({
  hoveredId,
  selectedId,
  rfNodes,
  scopeOf,
  tryCatchPairs,
}: {
  hoveredId?: string;
  selectedId?: string;
  rfNodes: Node[];
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined;
  tryCatchPairs: ReadonlyMap<string, string>;
}) {
  // The store's nodeLookup is stably mutated, so subscribing to it alone won't re-render;
  // `measuredKey` is a primitive digest that changes when cards measure, so boxes tighten to rendered sizes.
  const nodeLookup = useStore((s) => s.nodeLookup);
  // Only scoped cards affect region geometry, so the digest below covers just those — selector stays cheap.
  const scopedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of rfNodes) {
      if (node.type !== 'flowSplit') {
        continue;
      }
      const scope = scopeOf(node.id);
      if (scope) {
        for (const id of scope) {
          ids.add(id);
        }
      }
    }
    return ids;
  }, [rfNodes, scopeOf]);
  const measuredKey = useStore((s) => {
    // Integer digest of measured sizes (no per-frame string alloc); folds width+height so any reflow retriggers.
    let h = 0;
    for (const id of scopedIds) {
      const m = s.nodeLookup.get(id)?.measured;
      h = (h * 31 + Math.round(m?.width ?? 0)) % 2_147_483_647;
      h = (h * 31 + Math.round(m?.height ?? 0)) % 2_147_483_647;
    }
    return h;
  });
  // Geometry depends only on the layout + measurements, so cache it across hover/selection changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measuredKey re-triggers bounds when cards measure.
  const regions = useMemo<ScopeRegion[]>(() => {
    // A catch fused into a try is drawn as part of the try's area, not its own region.
    const absorbed = new Set(tryCatchPairs.values());
    const ctx: RegionContext = { rfNodes, scopeOf, nodeLookup, tryCatchPairs };
    const drafts = rfNodes
      .filter((n) => n.type === 'flowSplit' && !absorbed.has(n.id))
      .map((n) => scopeRegionDraft(n, ctx))
      .filter((d): d is ScopeRegionDraft => d !== null);
    // How many OTHER regions enclose each (its construct id is in their scope).
    const depthOf = (r: ScopeRegionDraft) => drafts.filter((o) => o.id !== r.id && o.scope.has(r.id)).length;
    const depths = drafts.map(depthOf);
    // Standoff scales with inner nesting depth (0 if none), so each enclosing box stands one step off the inner ones.
    const innerDepth = (i: number) =>
      drafts.reduce((h, o, j) => (j !== i && drafts[i].scope.has(o.id) ? Math.max(h, depths[j] - depths[i]) : h), 0);
    return drafts.map((r, i) => {
      const extra = innerDepth(i) * SCOPE_REGION_NEST_STEP;
      return { ...r, pad: SCOPE_REGION_PAD + extra, topPad: SCOPE_REGION_TOP_PAD + extra };
    });
  }, [rfNodes, scopeOf, nodeLookup, tryCatchPairs, measuredKey]);

  if (regions.length === 0) {
    return null;
  }
  // Emphasized when the active node is the construct or anywhere in its sub-graph (merge dots match via owner id).
  const activeId = hoveredId ?? selectedId;
  const activeOwner =
    activeId !== null && activeId !== undefined && activeId !== ''
      ? rfNodes.find((n) => n.id === activeId)?.data?.ownerId
      : undefined;
  return (
    <ViewportPortal>
      {regions.map((region) => {
        const active =
          activeId !== undefined &&
          (region.scope.has(activeId) ||
            (activeOwner !== null && activeOwner !== undefined && activeOwner !== ''
              ? region.scope.has(activeOwner)
              : false));
        return <RegionBox active={active} key={region.id} region={region} />;
      })}
    </ViewportPortal>
  );
}
