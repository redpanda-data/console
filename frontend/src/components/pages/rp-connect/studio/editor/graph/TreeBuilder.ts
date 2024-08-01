import { Position } from 'reactflow';

import { Tree, TreeNode, NodeHooks, GraphNode, GraphEdge, GraphItem } from './NodeData';

const kindToClass: {
  [key: string]: string | undefined;
} = {
  buffer: 'buffer',
  cache: 'resource',
  input: 'input',
  output: 'output',
  processor: 'processor',
  scanner: 'resource',
  rate_limit: 'resource',
  metric: 'resource',
};

const verticalPadding = 20;
const horizontalPadding = 60;
const componentWidth = 170;
const componentHeight = 50;
const componentTitleHeight = 20;

const childProcessorBumpOffset = 20;

type RenderConfig = {
  isChild: boolean;
};

function createEdge({ source, target, nodeHooks }: {
  source: string;
  target: string;
  nodeHooks: NodeHooks;
  config: RenderConfig;
}): GraphEdge {
  return {
    id: `e${source}-${target}`,
    source: source,
    target: target,
    animated: true,
    data: {
      src: source,
      nodeHooks: nodeHooks,
    },
  };
}

type SizedGraphNode = {
  width: number;
  height: number;
  node: GraphNode;
};

type NodePos = {
  x: number;
  y: number;
};

function createNode({ id, pos, component, nodeHooks, config }: {
  id: string;
  pos: NodePos;
  component: TreeNode;
  nodeHooks: NodeHooks;
  config: RenderConfig;
}): SizedGraphNode {
  const width = componentWidth;
  const className = kindToClass[component.kind || ''] || 'title';
  let height = componentHeight;

  let type = component.kind !== undefined ? 'componentEditMode' : 'titleEditMode';
  if (config.isChild && className === 'title') {
    type = 'componentTitleEditMode';
    height = componentTitleHeight;
  }

  const node: GraphNode = {
    id: id,
    className: className,
    selectable: component.kind !== undefined,
    type: type,
    data: {
      kind: component.kind,
      type: component.type,
      label: component.label,
      path: component.path,
      lintErrors: component.lint_errors,
      nodeHooks: nodeHooks,
      actions: component.actions,
      hasChildren: (component.children || []).length > 0,
      rootAction: component.root_action,
    },
    position: { x: pos.x, y: pos.y },
  };

  return {
    width: width,
    height: height,
    node: node,
  }
}

type nextIDFunc = () => string;

type NodeChain = {
  inputs: GraphNode[],
  outputs: GraphNode[],
  nodes: GraphItem[];
  height: number;
  width: number;
};

interface toNodesProps {
  nextID: nextIDFunc;
  pos: NodePos;
  component: TreeNode;
  nodeHooks: NodeHooks;
  config: RenderConfig;
};

function inputToNodes({ nextID, pos, component, nodeHooks, config }: toNodesProps): NodeChain {
  const createdNode = createNode({
    id: nextID(),
    pos: pos,
    component: component,
    nodeHooks: nodeHooks,
    config: config,
  });

  const node = createdNode.node;
  let { width, height } = createdNode;

  if (!node.position) {
    node.position = pos; // Makes compiler happy
  }

  const nodes: GraphItem[] = [node];
  let inputs: GraphNode[] = [node];
  let outputs: GraphNode[] = [node];

  const inputChildren = (component.children || []).filter((ele) => {
    return ele.kind === 'input' || (!ele.kind && ele.label !== 'batching processors');
  });
  const processorChildren = (component.children || []).filter((ele) => {
    return ele.kind === 'processor';
  });
  const scannerChild = (component.children || []).find((ele) => {
    return ele.kind === 'scanner';
  });
  const batchChild = (component.children || []).find((ele) => {
    return !ele.kind && ele.label === 'batching processors';
  });

  let baseHeight = height;
  let baseWidth = width;

  if (inputChildren.length > 0) {
    const children = verticalChain({
      nextID: nextID,
      linked: false,
      pos: { y: pos.y, x: pos.x },
      components: inputChildren,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...children.nodes);

    width += horizontalPadding + children.width;
    node.position.x += horizontalPadding + children.width;
    if (children.height > height) {
      height = children.height;
    }

    inputs.forEach((chainInput) => {
      chainInput.data.hasTarget = Position.Left;
      children.outputs.forEach((output) => {
        output.data.hasSource = Position.Right;
        nodes.push(createEdge({
          source: output.id,
          target: chainInput.id,
          nodeHooks: nodeHooks,
          config: config,
        }));
      });
    })
    inputs = children.inputs;
  }

  if (scannerChild) {
    const scannerNodes = componentToNodes({
      nextID: nextID,
      pos: { y: node.position.y + baseHeight + verticalPadding, x: node.position.x + childProcessorBumpOffset },
      component: scannerChild,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...scannerNodes.nodes);

    baseHeight += scannerNodes.height + verticalPadding;
    if (baseHeight > height) {
      height = baseHeight;
    }
    if ((scannerNodes.width + childProcessorBumpOffset) > baseWidth) {
      width += scannerNodes.width - baseWidth + childProcessorBumpOffset;
      baseWidth = scannerNodes.width + childProcessorBumpOffset;
    }

    outputs.forEach((chainOutput) => {
      chainOutput.data.hasSource = Position.Bottom;
      scannerNodes.inputs.forEach((input) => {
        input.data.hasTarget = Position.Top;
        nodes.push(createEdge({
          source: chainOutput.id,
          target: input.id,
          nodeHooks: nodeHooks,
          config: config,
        }));
      });
    });
    outputs = scannerNodes.outputs;
  }

  if (batchChild) {
    const batchNodes = componentToNodes({
      nextID: nextID,
      pos: { y: node.position.y + baseHeight + verticalPadding, x: node.position.x + childProcessorBumpOffset },
      component: batchChild,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...batchNodes.nodes);

    baseHeight += batchNodes.height + verticalPadding;
    if (baseHeight > height) {
      height = baseHeight;
    }
    if ((batchNodes.width + childProcessorBumpOffset) > baseWidth) {
      width += batchNodes.width - baseWidth + childProcessorBumpOffset;
      baseWidth = batchNodes.width + childProcessorBumpOffset;
    }

    outputs.forEach((chainOutput) => {
      chainOutput.data.hasSource = Position.Bottom;
      batchNodes.inputs.forEach((input) => {
        input.data.hasTarget = Position.Top;
        nodes.push(createEdge({
          source: chainOutput.id,
          target: input.id,
          nodeHooks: nodeHooks,
          config: config,
        }));
      });
    });
    outputs = batchNodes.outputs;
  }

  if (processorChildren.length > 0) {
    const children = verticalChain({
      nextID: nextID,
      linked: true,
      pos: { y: node.position.y + baseHeight + verticalPadding, x: node.position.x },
      components: processorChildren,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...children.nodes);

    baseHeight += children.height + verticalPadding;
    if (baseHeight > height) {
      height = baseHeight;
    }
    if (children.width > baseWidth) {
      width += children.width - baseWidth;
      baseWidth = children.width;
    }

    outputs.forEach((chainOutput) => {
      chainOutput.data.hasSource = Position.Bottom;
      children.inputs.forEach((input) => {
        input.data.hasTarget = Position.Top;
        nodes.push(createEdge({
          source: chainOutput.id,
          nodeHooks: nodeHooks,
          target: input.id,
          config: config,
        }));
      });
    });
    outputs = children.outputs;
  }

  return {
    inputs: inputs,
    outputs: outputs,
    nodes: nodes,
    height: height,
    width: width,
  };
}

function outputToNodes({ nextID, pos, component, nodeHooks, config }: toNodesProps): NodeChain {
  const createdNode = createNode({
    id: nextID(),
    pos: pos,
    component: component,
    nodeHooks: nodeHooks,
    config: config,
  });
  const { node } = createdNode;
  let { height, width } = createdNode;

  if (!node.position) {
    node.position = pos; // Makes compiler happy
  }

  const nodes: GraphItem[] = [node];
  let inputs: GraphNode[] = [node];
  let outputs: GraphNode[] = [node];

  const processorChildren = (component.children || []).filter((ele) => {
    return ele.kind === 'processor';
  });
  const batchChild = (component.children || []).find((ele) => {
    return !ele.kind && ele.label === 'batching processors';
  });
  const outputChildren = (component.children || []).filter((ele) => {
    return ele.kind === 'output' || (!ele.kind && ele.label !== 'batching processors');
  });

  const baseY = node.position.y;

  if (batchChild) {
    const batchNodes = componentToNodes({
      nextID: nextID,
      pos: { y: baseY, x: node.position.x + childProcessorBumpOffset },
      component: batchChild,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });

    nodes.forEach((n) => {
      const tmp = n as GraphNode;
      if (tmp.type) {
        tmp.position.y += batchNodes.height + verticalPadding;
      }
    });
    nodes.push(...batchNodes.nodes);

    height += batchNodes.height + verticalPadding;
    if ((batchNodes.width + childProcessorBumpOffset) > width) {
      width = batchNodes.width + childProcessorBumpOffset;
    }

    inputs.forEach((chainInput) => {
      chainInput.data.hasTarget = Position.Top;
      batchNodes.outputs.forEach((output) => {
        output.data.hasSource = Position.Bottom;
        nodes.push(createEdge({
          target: chainInput.id,
          source: output.id,
          nodeHooks: nodeHooks,
          config: config,
        }));
      })
    });
    inputs = batchNodes.inputs;
  }

  if (processorChildren.length > 0) {
    const children = verticalChain({
      nextID: nextID,
      linked: true,
      pos: { y: baseY, x: node.position.x },
      components: processorChildren,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });

    nodes.forEach((n) => {
      const tmp = n as GraphNode;
      if (tmp.position) {
        tmp.position.y += children.height + verticalPadding;
      }
    });
    nodes.push(...children.nodes);

    height += children.height + verticalPadding;
    if (children.width > width) {
      width = children.width;
    }

    inputs.forEach((chainInput) => {
      chainInput.data.hasTarget = Position.Top;
      children.outputs.forEach((output) => {
        output.data.hasSource = Position.Bottom;
        nodes.push(createEdge({
          target: chainInput.id,
          source: output.id,
          nodeHooks: nodeHooks,
          config: config,
        }));
      })
    });
    inputs = children.inputs;
  }

  if (outputChildren.length > 0) {
    width += horizontalPadding;
    const children = verticalChain({
      nextID: nextID,
      linked: false,
      pos: { y: pos.y, x: pos.x + width },
      components: outputChildren,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...children.nodes);

    width += children.width;
    if (children.height > height) {
      height = children.height;
    }

    outputs.forEach((chainOutput) => {
      chainOutput.data.hasSource = Position.Right;
      children.inputs.forEach((input) => {
        input.data.hasTarget = Position.Left;
        nodes.push(createEdge({
          source: chainOutput.id,
          target: input.id,
          nodeHooks: nodeHooks,
          config: config,
        }));
      })
    });
    outputs = children.outputs;
  }

  return {
    inputs: inputs,
    outputs: outputs,
    nodes: nodes,
    height: height,
    width: width,
  };
}

function processorToNodes({ nextID, pos, component, nodeHooks, config }: toNodesProps): NodeChain {
  const createdNode = createNode({
    id: nextID(),
    pos: pos,
    component: component,
    nodeHooks: nodeHooks,
    config: config,
  });
  const { node } = createdNode;
  let { height, width } = createdNode;
  if (!node.position) {
    node.position = pos; // Makes compiler happy
  }

  const nodes: GraphItem[] = [node];
  const inputs: GraphNode[] = [node];
  let outputs: GraphNode[] = [node];

  if ((component.children || []).length > 0) {
    height += verticalPadding;
    const children = verticalChain({
      nextID: nextID,
      linked: true,
      pos: { y: node.position.y + height, x: node.position.x + childProcessorBumpOffset },
      components: component.children,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...children.nodes);

    height += children.height;
    if ((children.width + childProcessorBumpOffset) > width) {
      width = children.width + childProcessorBumpOffset;
    }

    outputs.forEach((chainOutput) => {
      chainOutput.data.hasSource = Position.Bottom;
      children.inputs.forEach((input) => {
        input.data.hasTarget = Position.Top;
        nodes.push(createEdge({
          source: chainOutput.id,
          target: input.id,
          nodeHooks: nodeHooks,
          config: config,
        }));
      })
    });
    outputs = children.outputs;
  }

  if ((component.grouped_children || []).length > 0) {
    const groupVertPadding = verticalPadding * 1;

    // These will replace all the existing outputs.
    const groupOutputs: GraphNode[] = [];

    height += groupVertPadding;

    let extraHeight = 0;
    let extraWidth = 0;
    let posX = node.position.x;

    component.grouped_children.forEach(group => {
      if (group === null) {
        return;
      }

      const children = verticalChain({
        nextID: nextID,
        linked: true,
        pos: { y: (node.position?.y || 0) + height, x: posX },
        components: group,
        nodeHooks: nodeHooks,
        config: { ...config, isChild: true },
      });

      nodes.push(...children.nodes);

      posX += children.width + verticalPadding;
      extraWidth += children.width + verticalPadding;
      if (children.height > extraHeight) {
        extraHeight = children.height;
      }

      outputs.forEach((chainOutput) => {
        chainOutput.data.hasSource = Position.Bottom;
        children.inputs.forEach((input) => {
          input.data.hasTarget = Position.Top;
          nodes.push(createEdge({
            source: chainOutput.id,
            target: input.id,
            nodeHooks: nodeHooks,
            config: config,
          }));
        })
      });
      groupOutputs.push(...children.outputs);
    })

    if (extraWidth > width) {
      width = extraWidth;
    }
    height += extraHeight + groupVertPadding;

    // Swap the old outputs for our new group ones
    outputs = groupOutputs;
  }

  return {
    inputs: inputs,
    outputs: outputs,
    nodes: nodes,
    height: height,
    width: width,
  };
}

function generalToNodes({ nextID, pos, component, nodeHooks, config }: toNodesProps): NodeChain {
  const createdNode = createNode({
    id: nextID(),
    pos: pos,
    component: component,
    nodeHooks: nodeHooks,
    config: config,
  });
  const { node } = createdNode;
  let { height, width } = createdNode;
  if (!node.position) {
    node.position = pos; // Makes compiler happy
  }

  const nodes: GraphItem[] = [node];
  let inputs: GraphNode[] = [];
  let outputs: GraphNode[] = [];

  if (component.kind !== undefined) {
    inputs = [node];
    outputs = [node];
  } else if ((component.children || []).length === 0) {
    // TODO: Just a label with no children, so reduce width.
    // width = 60;
  }

  if ((component.children || []).length > 0) {
    height += verticalPadding;
    const children = verticalChain({
      nextID: nextID,
      linked: true,
      pos: { y: node.position.y + height, x: node.position.x },
      components: component.children,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...children.nodes);

    height += children.height;
    if (children.width > width) {
      width = children.width;
    }

    if (component.kind !== undefined) {
      outputs.forEach((chainOutput) => {
        chainOutput.data.hasSource = Position.Bottom;
        children.inputs.forEach((input) => {
          input.data.hasTarget = Position.Top;
          nodes.push(createEdge({
            source: chainOutput.id,
            target: input.id,
            nodeHooks: nodeHooks,
            config: config,
          }));
        });
      });
    } else {
      inputs = children.inputs;
    }
    outputs = children.outputs;
  }

  return {
    inputs: inputs,
    outputs: outputs,
    nodes: nodes,
    height: height,
    width: width,
  };
}

function componentToNodes(props: toNodesProps) {
  switch (props.component.kind) {
    case 'input':
      return inputToNodes(props);
    case 'output':
      return outputToNodes(props);
    case 'processor':
      return processorToNodes(props);
    case 'scanner':
      return processorToNodes(props);
    default:
      return generalToNodes(props);
  }
}

interface chainToNodesProps {
  nextID: nextIDFunc;
  linked: boolean;
  pos: NodePos;
  components: TreeNode[];
  nodeHooks: NodeHooks;
  config: RenderConfig;
};

function verticalChain({ nextID, linked, pos, components, nodeHooks, config }: chainToNodesProps): NodeChain {
  const nodes: GraphItem[] = [];
  const inputs: GraphNode[] = [];
  let outputs: GraphNode[] = [];

  let height = 0;
  let width = 0;

  components.forEach((component) => {
    const last = componentToNodes({
      nextID: nextID,
      pos: {
        x: pos.x,
        y: pos.y + height,
      },
      component: component,
      nodeHooks: nodeHooks,
      config: config,
    });
    nodes.push(...last.nodes);

    height += last.height + verticalPadding;
    if (last.width > width) {
      width = last.width;
    }

    if (!linked) {
      inputs.push(...last.inputs);
      outputs.push(...last.outputs);
      return;
    }

    if (last.inputs.length === 0 && last.outputs.length === 0) {
      return;
    }

    if (inputs.length === 0) {
      inputs.push(...last.inputs);
      outputs.push(...last.outputs);
    } else {
      last.inputs.forEach((input) => {
        outputs.forEach((output) => {
          input.data.hasTarget = Position.Top;
          output.data.hasSource = Position.Bottom;
          nodes.push(createEdge({
            source: output.id,
            target: input.id,
            nodeHooks: nodeHooks,
            config: config,
          }));
        })
      })
      outputs = last.outputs;
    }
  })
  height -= verticalPadding;

  return {
    inputs: inputs,
    outputs: outputs,
    nodes: nodes,
    height: height,
    width: width,
  };
}

function horizontalChain({ nextID, linked, pos, components, nodeHooks, config }: chainToNodesProps): NodeChain {
  const nodes: GraphItem[] = [];
  const inputs: GraphNode[] = [];
  let outputs: GraphNode[] = [];

  let height = 0;
  let width = 0;

  components.forEach((component) => {
    const last = componentToNodes({
      nextID: nextID,
      pos: {
        x: pos.x + width,
        y: pos.y,
      },
      component: component,
      nodeHooks: nodeHooks,
      config: config,
    });
    nodes.push(...last.nodes);

    width += last.width + horizontalPadding;
    if (last.height > height) {
      height = last.height;
    }

    if (!linked) {
      inputs.push(...last.inputs);
      outputs.push(...last.outputs);
      return;
    }

    if (last.inputs.length === 0 && last.outputs.length === 0) {
      return;
    }

    if (inputs.length === 0) {
      inputs.push(...last.inputs);
      outputs.push(...last.outputs);
    } else {
      last.inputs.forEach((input) => {
        outputs.forEach((output) => {
          input.data.hasTarget = Position.Left;
          output.data.hasSource = Position.Right;
          nodes.push(createEdge({
            source: output.id,
            target: input.id,
            nodeHooks: nodeHooks,
            config: config,
          }));
        })
      })
      outputs = last.outputs;
    }
  })
  width -= horizontalPadding;

  return {
    inputs: inputs,
    outputs: outputs,
    nodes: nodes,
    height: height,
    width: width,
  };
}

function resourcesChain({ nextID, pos, components, nodeHooks, config }: chainToNodesProps): NodeChain {
  const nodes: GraphItem[] = [];

  let height = 0;
  let width = 0;

  components.forEach((component) => {
    const { node, height: titleHeight, width: titleWidth } = createNode({
      id: nextID(),
      pos: { x: pos.x + width, y: pos.y },
      component: component,
      nodeHooks: nodeHooks,
      config: config,
    });
    nodes.push(node);

    if ((component.children || []).length === 0) {
      if (titleHeight > height) {
        height = titleHeight;
      }
      width += titleWidth + horizontalPadding;
      return;
    }

    const last = horizontalChain({
      nextID: nextID,
      linked: false,
      pos: {
        x: pos.x + width,
        y: pos.y + titleHeight + verticalPadding,
      },
      components: component.children,
      nodeHooks: nodeHooks,
      config: { ...config, isChild: true },
    });
    nodes.push(...last.nodes);

    last.height += titleHeight + verticalPadding;
    width += last.width + horizontalPadding;
    if (last.height > height) {
      height = last.height;
    }
  })
  width -= horizontalPadding;

  return {
    inputs: [],
    outputs: [],
    nodes: nodes,
    height: height,
    width: width,
  };
}

export default function Build({
  tree, nodeHooks,
}: {
  tree: Tree;
  nodeHooks: NodeHooks;
}) {
  let i = 0;
  const id = Math.floor(Math.random() * 1000);
  const ts = Date.now();
  const nextID = () => {
    return `${ts}-${id}-${i++}`;
  };
  const nodes: GraphItem[] = [];
  let top = 0;
  const left = 0;

  const hideRootActions = tree.read_only;
  const config: RenderConfig = {
    isChild: false,
  };

  if (tree.stream !== undefined) {
    const { nodes: streamNodes, height } = horizontalChain({
      nextID: nextID,
      linked: true,
      pos: { x: left, y: top },
      components: tree.stream.filter((n) => !hideRootActions || !n.root_action),
      nodeHooks: nodeHooks,
      config: config,
    });
    nodes.push(...streamNodes);
    top = height;
  }

  if (tree.resources !== undefined) {
    if (!hideRootActions) {
      const upperTree = tree.resources.filter((n) => n.root_action);
      if (upperTree.length > 0 && !tree.read_only) {
        const { nodes: resourceNodes, height } = resourcesChain({
          nextID: nextID,
          linked: false,
          pos: { x: 0, y: top + verticalPadding },
          components: upperTree,
          nodeHooks: nodeHooks,
          config: config,
        });
        nodes.push(...resourceNodes);
        top += height;
      }
    }

    const lowerTree = tree.resources.filter((n) => !n.root_action);
    if (lowerTree.length > 0) {
      const { nodes: resourceNodes, height } = resourcesChain({
        nextID: nextID,
        linked: false,
        pos: { x: 0, y: top + verticalPadding },
        components: lowerTree,
        nodeHooks: nodeHooks,
        config: config,
      });
      nodes.push(...resourceNodes);
      top += height;
    }

    top += verticalPadding;
  }

  if (tree.observability !== undefined) {
    const { nodes: observabilityNodes, height } = resourcesChain({
      nextID: nextID,
      linked: false,
      pos: { x: 0, y: top + verticalPadding },
      components: tree.observability,
      nodeHooks: nodeHooks,
      config: config,
    });
    nodes.push(...observabilityNodes);
    top += height + verticalPadding;
  }

  return nodes;
}
