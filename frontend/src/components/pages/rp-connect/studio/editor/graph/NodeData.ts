import { Position, Node, Edge } from 'reactflow';
// import { SessionView } from '../../session/Session';
import { RoleIsReadOnly } from '../../role';

export type NodeHook = (arg: NodeAction[]) => void;

export type NodeHooks = {
  isReadOnly: () => boolean;
  openActionModal: NodeHook;
  headlessAction: NodeHook;
};

export enum NodeRunState {
  None,
  NeedsMock,
  IsMocked,
  Error,
}

export type NodeData = {
  src?: string;
  rootAction?: boolean;
  hasChildren?: boolean;
  hasTarget?: Position;
  hasSource?: Position;
  nodeHooks: NodeHooks;
  setRunState?: (runState: NodeRunState) => void;
  setSelectedNode?: (node: NodeDataCore | null) => void;
  setEvents?: (events: NodeEvent[]) => void;
} & NodeDataCore;

export type NodeDataCore = {
  label?: string;
  type?: string;
  kind?: string;
  path?: string;
  lintErrors?: string[];
  actions?: NodeAction[];
};

export function NodeTypeHasLabel(nodeType: string): boolean {
  switch (nodeType) {
    case 'buffer':
      return false;
    case 'scanner':
      return false;
    default:
      return true;
  }
}

export type GraphEdge = Edge<NodeData>;

export type GraphNode = Node<NodeData>;

export type GraphItem = GraphNode | GraphEdge;

export type NodeAction = {
  operation: string;
  kind?: string;
  path?: string;
  value?: string;
};

export type NodeEvent = {
  type: string;
};

export type TreeNode = {
  label?: string;
  path: string;
  kind?: string;
  type?: string;
  children: TreeNode[];
  grouped_children: TreeNode[][];
  actions: NodeAction[];
  root_action: boolean;
  line_start: number;
  line_end: number;
  lint_errors?: string[];
};

export type GraphResponse = {
  stream?: TreeNode[];
  resources?: TreeNode[];
  observability?: TreeNode[];
  has_undo: boolean;
  has_redo: boolean;
  // view?: SessionView;
};

export type Tree = {
  stream?: TreeNode[];
  resources?: TreeNode[];
  observability?: TreeNode[];
  read_only: boolean;
  has_undo: boolean;
  has_redo: boolean;
};

export function GraphResToTree(res: GraphResponse): Tree {
  return {
    stream: res.stream,
    resources: res.resources,
    observability: res.observability,
    has_undo: res.has_undo,
    has_redo: res.has_redo,
    read_only: RoleIsReadOnly('') // read_only: RoleIsReadOnly(res.view?.user_role || ''),
  };
}

export type RunEvent = {
  type: string;
  content: string;
  metadata: {
    [key: string]: any;
  };
};

export type RunResult = {
  input_events: {
    [key: string]: RunEvent[];
  };
  missing_inputs: {
    [key: string]: {};
  };
  processor_events: {
    [key: string]: RunEvent[];
  };
  missing_processors: {
    [key: string]: {};
  };
  output_events: {
    [key: string]: RunEvent[];
  };
  components_mocked: {
    [key: string]: {};
  };
  summary?: {
    input: number;
    processor_errors: number;
    output: number;
  };
  error?: Error;
  force_closed?: boolean;
};

export type MockInput = {
  messages: string[];
};

export type MockProcessor = {
  mapping: string;
};

export type RunConfig = {
  mock_inputs: {
    [key: string]: MockInput;
  };
  mock_processors: {
    [key: string]: MockProcessor;
  };
};

export type TraceEventCategory = {
  [key: string]: RunEvent[];
};

export type TraceEvents = {
  input_events?: TraceEventCategory;
  processor_events?: TraceEventCategory;
  output_events?: TraceEventCategory;
};

export type NodeTraceEvents = {
  deployment_name: string;
  by_node_name: { [key: string]: TraceEvents };
}

export type RunEventsPerDep = {
  DeploymentName: string;
} & TraceEvents;

function expandEventsWith(target: TraceEventCategory, from: TraceEventCategory) {
  Object.keys(from).forEach((path: string) => {
    const tmp: RunEvent[] = target[path] || [];
    tmp.push(...from[path]);
    target[path] = tmp;
  })
}

export type DeploymentTraceEvents = {
  [key: string]: NodeTraceEvents;
}

export function DeploymentTracesFlattened(deploymentTraces: DeploymentTraceEvents): {
  ByDeployment: RunEventsPerDep[];
  JustFlat: TraceEvents;
} {
  const flatPerDeployment: RunEventsPerDep[] = [];
  const justFlat: TraceEvents = {
    input_events: {},
    processor_events: {},
    output_events: {},
  };

  if (deploymentTraces) {
    Object.keys(deploymentTraces).forEach((depID: string) => {
      const aggregateEvents: TraceEvents = {
        input_events: {},
        processor_events: {},
        output_events: {},
      };

      const nodeEvents = deploymentTraces[depID];
      Object.keys(nodeEvents.by_node_name || {}).forEach((nodeName: string) => {
        const events = nodeEvents.by_node_name[nodeName];

        expandEventsWith(aggregateEvents.input_events || {}, events.input_events || {});
        expandEventsWith(justFlat.input_events || {}, events.input_events || {});

        expandEventsWith(aggregateEvents.processor_events || {}, events.processor_events || {});
        expandEventsWith(justFlat.processor_events || {}, events.processor_events || {});

        expandEventsWith(aggregateEvents.output_events || {}, events.output_events || {});
        expandEventsWith(justFlat.output_events || {}, events.output_events || {});
      });

      flatPerDeployment.push({
        DeploymentName: nodeEvents.deployment_name,
        ...aggregateEvents,
      });
    });
  }

  return {
    ByDeployment: flatPerDeployment,
    JustFlat: justFlat,
  };
};
