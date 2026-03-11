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

/**
 * Parses a Redpanda Connect pipeline YAML config into a tree of React Flow
 * nodes and edges suitable for rendering as a flow diagram.
 */

import type { Edge, Node } from '@xyflow/react';
import { parse as parseYaml } from 'yaml';

import { firstKey, PROCESSORS_WITH_NESTED_STEPS, parseMultiInputs, parseMultiOutputs } from './yaml-parsing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SectionKind = 'input' | 'processor' | 'output';

/** A leaf node represents a single component (e.g. kafka, mapping). */
export type TreeLeaf = {
  kind: 'leaf';
  name: string;
  section: SectionKind;
  id: string;
};

/** A group node contains nested children (e.g. broker with child inputs). */
export type TreeGroup = {
  kind: 'group';
  name: string;
  section: SectionKind;
  id: string;
  children: TreeNode[];
};

/** A section node is a top-level container (input / pipeline / output). */
export type TreeSection = {
  kind: 'section';
  label: string;
  section: SectionKind;
  id: string;
  children: TreeNode[];
};

export type TreeNode = TreeLeaf | TreeGroup | TreeSection;

// React Flow node data types
export type TreeSectionNodeData = { label: string; section: SectionKind; collapsed: boolean };
export type TreeGroupNodeData = { name: string; section: SectionKind; childCount: number };
export type TreeLeafNodeData = { name: string; section: SectionKind };

// ---------------------------------------------------------------------------
// YAML → Tree
// ---------------------------------------------------------------------------

type ParsedConfig = {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  pipeline?: { processors?: Record<string, unknown>[] };
};

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;

/** Reset the id counter (useful for deterministic tests). */
export const resetIdCounter = () => {
  idCounter = 0;
};

function parseInputSection(inputObj: Record<string, unknown>): TreeNode[] {
  const inputKey = firstKey(inputObj);
  if (!inputKey) return [];

  const value = inputObj[inputKey];
  const children = parseMultiInputs(inputKey, value);

  if (children && children.length > 0) {
    return [
      {
        kind: 'group',
        name: inputKey,
        section: 'input',
        id: nextId('input-group'),
        children: children.map((name) => ({
          kind: 'leaf' as const,
          name,
          section: 'input' as const,
          id: nextId('input'),
        })),
      },
    ];
  }

  return [{ kind: 'leaf', name: inputKey, section: 'input', id: nextId('input') }];
}

function parseProcessorNode(proc: Record<string, unknown>): TreeNode {
  const procKey = firstKey(proc);
  if (!procKey) return { kind: 'leaf', name: 'unknown', section: 'processor', id: nextId('proc') };

  if ((PROCESSORS_WITH_NESTED_STEPS as readonly string[]).includes(procKey)) {
    const nested = extractNestedProcessors(procKey, proc[procKey]);
    if (nested.length > 0) {
      return {
        kind: 'group',
        name: procKey,
        section: 'processor',
        id: nextId('proc-group'),
        children: nested,
      };
    }
  }

  return { kind: 'leaf', name: procKey, section: 'processor', id: nextId('proc') };
}

function extractNestedProcessors(parentKey: string, value: unknown): TreeNode[] {
  if (!value) return [];

  // switch: array of cases with optional processors
  if (parentKey === 'switch' && Array.isArray(value)) {
    const procs: TreeNode[] = [];
    for (const c of value) {
      if (c && typeof c === 'object' && 'processors' in c && Array.isArray(c.processors)) {
        for (const p of c.processors) {
          procs.push(parseProcessorNode(p as Record<string, unknown>));
        }
      }
    }
    return procs;
  }

  // branch: has request_map, processors, result_map
  if (parentKey === 'branch' && typeof value === 'object' && !Array.isArray(value)) {
    const branchVal = value as { processors?: unknown[] };
    if (Array.isArray(branchVal.processors)) {
      return branchVal.processors.map((p) => parseProcessorNode(p as Record<string, unknown>));
    }
    return [];
  }

  // catch, try, for_each, parallel: direct array of processors
  if (Array.isArray(value)) {
    return value.map((p) => parseProcessorNode(p as Record<string, unknown>));
  }

  // while: has `check` and inner `processors` array
  if (typeof value === 'object' && value !== null && 'processors' in value) {
    const whileVal = value as { processors?: unknown[] };
    if (Array.isArray(whileVal.processors)) {
      return whileVal.processors.map((p) => parseProcessorNode(p as Record<string, unknown>));
    }
  }

  return [];
}

function parseProcessorSection(processors: Record<string, unknown>[]): TreeNode[] {
  return processors.map((proc) => parseProcessorNode(proc));
}

function parseOutputSection(outputObj: Record<string, unknown>): TreeNode[] {
  const outputKey = firstKey(outputObj);
  if (!outputKey) return [];

  const value = outputObj[outputKey];
  const children = parseMultiOutputs(outputKey, value);

  if (children && children.length > 0) {
    return [
      {
        kind: 'group',
        name: outputKey,
        section: 'output',
        id: nextId('output-group'),
        children: children.map((name) => ({
          kind: 'leaf' as const,
          name,
          section: 'output' as const,
          id: nextId('output'),
        })),
      },
    ];
  }

  return [{ kind: 'leaf', name: outputKey, section: 'output', id: nextId('output') }];
}

// ---------------------------------------------------------------------------
// Public API: parsePipelineFlowTree
// ---------------------------------------------------------------------------

export type PipelineFlowTree = {
  sections: TreeSection[];
};

/** Parse a pipeline YAML string into a tree structure for rendering. */
export function parsePipelineFlowTree(yamlContent: string): PipelineFlowTree {
  resetIdCounter();

  const empty: PipelineFlowTree = { sections: [] };
  if (!yamlContent.trim()) return empty;

  let config: ParsedConfig | null;
  try {
    config = parseYaml(yamlContent) as ParsedConfig | null;
  } catch {
    return empty;
  }

  if (!config) return empty;

  const sections: TreeSection[] = [];

  // Input section
  if (config.input && typeof config.input === 'object') {
    sections.push({
      kind: 'section',
      label: 'Input',
      section: 'input',
      id: 'section-input',
      children: parseInputSection(config.input),
    });
  }

  // Processor section
  if (config.pipeline?.processors && Array.isArray(config.pipeline.processors)) {
    sections.push({
      kind: 'section',
      label: 'Pipeline',
      section: 'processor',
      id: 'section-processor',
      children: parseProcessorSection(config.pipeline.processors),
    });
  }

  // Output section
  if (config.output && typeof config.output === 'object') {
    sections.push({
      kind: 'section',
      label: 'Output',
      section: 'output',
      id: 'section-output',
      children: parseOutputSection(config.output),
    });
  }

  return { sections };
}

// ---------------------------------------------------------------------------
// Tree → React Flow layout
// ---------------------------------------------------------------------------

const NODE_WIDTH = 200;
const NODE_HEIGHT = 40;
const GROUP_PADDING_X = 16;
const GROUP_PADDING_TOP = 40;
const GROUP_PADDING_BOTTOM = 16;
const SECTION_PADDING_X = 16;
const SECTION_PADDING_TOP = 44;
const SECTION_PADDING_BOTTOM = 16;
const GAP_Y = 12;
const SECTION_GAP_X = 60;

type LayoutResult = {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
};

function layoutLeaf(leaf: TreeLeaf, x: number, y: number): LayoutResult {
  const node: Node = {
    id: leaf.id,
    type: 'treeLeaf',
    position: { x, y },
    data: { name: leaf.name, section: leaf.section } satisfies TreeLeafNodeData,
    style: { width: NODE_WIDTH, height: NODE_HEIGHT },
  };
  return { nodes: [node], edges: [], width: NODE_WIDTH, height: NODE_HEIGHT };
}

function layoutGroup(group: TreeGroup, x: number, y: number): LayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let childY = GROUP_PADDING_TOP;
  let maxChildWidth = 0;

  for (const child of group.children) {
    const result = layoutChild(child, GROUP_PADDING_X, childY);
    for (const n of result.nodes) {
      n.parentId = group.id;
      n.extent = 'parent';
      nodes.push(n);
    }
    edges.push(...result.edges);
    childY += result.height + GAP_Y;
    maxChildWidth = Math.max(maxChildWidth, result.width);
  }

  const groupWidth = Math.max(NODE_WIDTH, maxChildWidth + GROUP_PADDING_X * 2);
  const groupHeight = childY - GAP_Y + GROUP_PADDING_BOTTOM;

  const groupNode: Node = {
    id: group.id,
    type: 'treeGroup',
    position: { x, y },
    data: { name: group.name, section: group.section, childCount: group.children.length } satisfies TreeGroupNodeData,
    style: { width: groupWidth, height: groupHeight },
  };

  return { nodes: [groupNode, ...nodes], edges, width: groupWidth, height: groupHeight };
}

function layoutChild(node: TreeNode, x: number, y: number): LayoutResult {
  switch (node.kind) {
    case 'leaf':
      return layoutLeaf(node, x, y);
    case 'group':
      return layoutGroup(node, x, y);
    case 'section':
      return layoutSection(node, x, y);
  }
}

function layoutSection(section: TreeSection, x: number, y: number): LayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let childY = SECTION_PADDING_TOP;
  let maxChildWidth = 0;

  for (const child of section.children) {
    const result = layoutChild(child, SECTION_PADDING_X, childY);
    for (const n of result.nodes) {
      if (!n.parentId) {
        n.parentId = section.id;
        n.extent = 'parent';
      }
      nodes.push(n);
    }
    edges.push(...result.edges);
    childY += result.height + GAP_Y;
    maxChildWidth = Math.max(maxChildWidth, result.width);
  }

  const sectionWidth = Math.max(NODE_WIDTH, maxChildWidth + SECTION_PADDING_X * 2);
  const sectionHeight =
    section.children.length > 0
      ? childY - GAP_Y + SECTION_PADDING_BOTTOM
      : SECTION_PADDING_TOP + SECTION_PADDING_BOTTOM;

  const sectionNode: Node = {
    id: section.id,
    type: 'treeSection',
    position: { x, y },
    data: { label: section.label, section: section.section, collapsed: false } satisfies TreeSectionNodeData,
    style: { width: sectionWidth, height: sectionHeight },
  };

  return { nodes: [sectionNode, ...nodes], edges, width: sectionWidth, height: sectionHeight };
}

/** Connect sections with edges. */
function connectSections(sections: TreeSection[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const source = sections[i];
    const target = sections[i + 1];
    if (source && target) {
      edges.push({
        id: `section-edge-${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        type: 'sectionEdge',
      });
    }
  }
  return edges;
}

/** Compute full React Flow layout from a PipelineFlowTree. */
export function computeTreeLayout(tree: PipelineFlowTree): { nodes: Node[]; edges: Edge[] } {
  if (tree.sections.length === 0) return { nodes: [], edges: [] };

  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];
  let x = 0;

  for (const section of tree.sections) {
    const result = layoutSection(section, x, 0);
    allNodes.push(...result.nodes);
    allEdges.push(...result.edges);
    x += result.width + SECTION_GAP_X;
  }

  allEdges.push(...connectSections(tree.sections));

  return { nodes: allNodes, edges: allEdges };
}

// ---------------------------------------------------------------------------
// Topic extraction (for connectors display)
// ---------------------------------------------------------------------------

/** Extract all referenced topic names from input/output configs. */
export function extractAllTopics(yamlContent: string): string[] {
  if (!yamlContent.trim()) return [];

  let config: Record<string, unknown>;
  try {
    config = parseYaml(yamlContent) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (!config) return [];

  const topics = new Set<string>();

  function walkForTopics(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (const item of obj) walkForTopics(item);
      return;
    }

    const record = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if ((key === 'topic' || key === 'topics') && typeof value === 'string' && value) {
        topics.add(value);
      } else if (key === 'topics' && Array.isArray(value)) {
        for (const t of value) {
          if (typeof t === 'string' && t) topics.add(t);
        }
      } else {
        walkForTopics(value);
      }
    }
  }

  walkForTopics(config);
  return [...topics];
}
