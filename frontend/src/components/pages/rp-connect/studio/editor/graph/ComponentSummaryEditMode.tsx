import { useState, useMemo } from 'react';
import { Handle } from 'reactflow';
import classNames from 'classnames';

import GetLogo from '../../componentLogos';
import KindColor from '../../kindColors';
import icon from '../../icon';
import { NodeData, NodeAction, NodeEvent, NodeRunState, NodeHook, NodeDataCore } from './NodeData';

import styles from './ComponentSummaryEditMode.module.css';
import { observer } from 'mobx-react';

import '../../index.css';
import { Image } from '@chakra-ui/react';

function getLogo(type: string) {
  const logoName = GetLogo({ type });
  if (logoName === null) {
    return null;
  }

  return <Image
    className={styles.logoImg}
    height="20px"
    alt="logo"
    src={`/pipelineUI/img/logos/${logoName}`}
  />
}

function title(data: NodeData) {
  if (typeof (data.label) !== 'undefined') {
    return <>
      <div>{data.label}</div>
      <div><small><strong>{data.type}</strong></small></div>
    </>
  }
  return <small><strong>{data.type}</strong></small>
}

function capitalize(str: string): string {
  return str.replace(/^\w/, (c) => c.toUpperCase());
}

function shortOperation(op: string): string {
  switch (op) {
    case 'add':
      return '+ add';
    case 'set':
      return 'edit';
    default:
      return capitalize(op);
  }
}

const modalActions: {
  [key: string]: boolean | undefined;
} = {
  'add': true,
  'set': true,
};

function isModalAction(action: NodeAction) {
  return modalActions[action.operation] !== undefined;
}

const moveActions: {
  [key: string]: boolean | undefined;
} = {
  'move above': true,
  'move below': true,
  'add from': true,
};

function isMoveAction(action: NodeAction) {
  return moveActions[action.operation] !== undefined;
}

function sideActionButtons(data: NodeData) {
  if (data.nodeHooks.isReadOnly()) {
    return null;
  }

  const collapsedActions = (data.actions || [])
    .filter((action) => !isMoveAction(action))
    .map((action) => {
      const isModal = isModalAction(action);
      let borderColor = KindColor({ kind: action.kind || '' });
      if (action.operation === 'delete') {
        borderColor = 'var(--bstdio-pink)';
      }
      return {
        title: action.operation + (action.kind ? ' ' + action.kind : ''),
        hook: isModal ? data.nodeHooks.openActionModal : data.nodeHooks.headlessAction,
        style: data.kind === undefined ? 'bstdioSmallTextBtn' : 'bstdioBtn bstdioMedPadBtn bstdioSmallMarginBottom',
        content: data.kind === undefined ? shortOperation(action.operation) : <span style={{
          fontSize: '0.7rem',
          borderBottom: `2px solid ${borderColor}`,
        }}>
          {capitalize(action.operation) + (action.kind ? ' ' + action.kind : '')}
        </span>,
        arg: action,
      };
    });

  if (data.kind !== undefined) {
    collapsedActions.push({
      title: 'delete',
      hook: data.nodeHooks.headlessAction,
      style: 'bstdioBtn bstdioWarnBtn bstdioSmlPadBtn bstdioSmallMarginBottom',
      content: <span style={{
        fontSize: '0.7rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: '5px',
      }}>
        {icon.delete}{'Delete'}
      </span>,
      arg: {
        operation: 'delete',
        path: data.path,
      },
    })

  }

  if (collapsedActions.length === 0) {
    return null;
  }

  return <div className={classNames(data.kind === undefined ? styles.titleActions : styles.componentActions)}>
    {collapsedActions.map((action, idx) => {
      return <button
        className={action.style}
        key={idx}
        onClick={
          (e) => {
            e.stopPropagation();
            action.hook([action.arg]);
          }
        }
        title={action.title}
      >{action.content}</button>;
    })}
  </div>;
};

function bigButton(selectedNode: NodeDataCore | null, data: NodeData) {
  const actions = (data.actions || []).filter((action) => isModalAction(action));
  let title = 'Add a resource';
  let borderColor = '#ab9df2';
  let optional = true;
  if (data.actions && data.actions.length <= 2) {
    optional = false;
    switch (data.actions[0].kind) {
      case 'input':
        borderColor = '#78dce8';
        title = 'Add an input';
        break;
      case 'buffer':
        borderColor = '#fc9867';
        title = 'Set a buffer';
        optional = true;
        break;
      case 'output':
        borderColor = '#ff6188';
        title = 'Add an output';
        break;
      case 'processor':
        borderColor = '#a9dc76';
        title = 'Add a processor';
        optional = true;
        break;
      case 'metrics':
        title = 'Emit metrics';
        optional = true;
        break;
      case 'tracer':
        title = 'Emit tracing';
        optional = true;
        break;
      default:
    }
  }
  return (
    <>
      <button
        className={classNames(styles.bigActionBtn, 'bstdioBtn bstdioMedPadBtn bstdioLayerTwoActive')}
        title={title}
        onClick={
          (e) => {
            e.stopPropagation();
            data.nodeHooks.openActionModal(actions);
          }
        }>
        <span className={styles.bigActionTitle} style={{
          borderColor: borderColor,
        }}>{title}</span>
        {optional && <><small>optional</small></>}
      </button>
      {/* TODO: Filter actions that move a resource back into generic resources button */}
      {selectedNode ? activatedActionButtons(selectedNode, data) : null}
    </>
  );
}

function activatedActionButtons(selectedData: NodeDataCore, data: NodeData) {
  if (data.nodeHooks.isReadOnly()) {
    return <></>;
  }

  if ((data.actions || []).length === 0) {
    return <></>;
  }

  type presentedAction = {
    title: string;
    hook: NodeHook;
    arg: NodeAction;
  };

  const activatedActions = (data.actions || [])
    .filter((action) => isMoveAction(action))
    .filter((action) => {
      let targetKind = action.kind;
      if ((targetKind || '').length === 0) {
        targetKind = data.kind || '';
      }
      return targetKind === selectedData.kind;
    })
    .map((action: NodeAction): presentedAction => {
      return {
        title: action.operation,
        hook: data.nodeHooks.headlessAction,
        arg: {
          operation: action.operation,
          path: action.path || data.path,
          value: selectedData.path,
        },
      };
    })
    .filter((action) => {
      if (action.arg.path?.endsWith('_resources')) {
        // No point moving resources back into resources!
        return !action.arg.value?.startsWith(action.arg.path);
      }
      if (!action.arg.value) {
        return true;
      }
      return !action.arg.path?.startsWith(action.arg.value);
    });

  return <>
    {activatedActions.map((action, idx) => {
      return <button
        className={classNames(
          styles.activatedActionBtn,
          ((title) => {
            if (title === 'move above') {
              return styles.activatedActionTopBtn;
            }
            if (title === 'move below') {
              return styles.activatedActionBottomBtn;
            }
            if (title === 'add from') {
              return styles.activatedActionBottomBtn;
            }
            return false;
          })(action.title),
        )}
        key={idx}
        onClick={
          (e) => {
            e.stopPropagation();
            action.hook([action.arg]);
          }
        }
        title={'move here'}
      ></button>;
    })}
  </>;
};


export const ComponentSummaryEditMode = observer(({ data }: { data: NodeData }) => {
  const [selectedNode, setSelectedNode] = useState<NodeDataCore | null>(null);
  data.setSelectedNode = setSelectedNode;

  // RUN STUFF
  const [runState, setRunState] = useState<NodeRunState>(NodeRunState.None);
  data.setRunState = setRunState;

  const [events, setEvents] = useState<NodeEvent[]>([]);
  data.setEvents = setEvents;

  const isSelected = selectedNode && data.path === selectedNode.path;
  const isNotSelected = selectedNode && data.path !== selectedNode.path;

  const sideActionBtns = isSelected ? sideActionButtons(data) : null;

  const sourceHandleDisplayStyle: any = useMemo(() => {
    if (sideActionBtns && data.hasSource === 'bottom') {
      return '0%';
    }
    return '100%';
  }, [sideActionBtns, data.hasSource]);

  if (data.kind === undefined) {
    if (!data.rootAction) {
      return (
        <div className={styles.titleContent}>
          <div className={styles.title}>
            <strong>{data.label}</strong>
          </div>
          {sideActionButtons(data)}
          {selectedNode ? activatedActionButtons(selectedNode, data) : null}
        </div>
      );
    }
    return bigButton(selectedNode, data);
  }

  // RUN SUMMARY
  const numConsumed = events.filter(v => v.type === 'CONSUME').length;
  const numDeleted = events.filter(v => v.type === 'DELETE').length;
  const numErrors = events.filter(v => v.type === 'ERROR').length;
  const numProduced = events.filter(v => v.type === 'PRODUCE').length;

  return (
    <>
      {isSelected ? <div className={classNames(styles.componentAura, sideActionBtns && styles.componentAuraWithActions)}>
        {sideActionBtns}
      </div> : null}
      <div className={styles.componentSummary}>
        {data.hasTarget && <Handle isConnectable={false} type="target" position={data.hasTarget} />}
        {events.length > 0 ? <div className={styles.eventSummary}>
          {numConsumed > 0 ? <div title="num consumed" className={styles.eventConsume}>{numConsumed}</div> : null}
          {numDeleted > 0 ? <div title="num deleted" className={styles.eventDelete}>{numDeleted}</div> : null}
          {numErrors > 0 ? <div title="num errors" className={styles.eventError}>{numErrors}</div> : null}
          {numProduced > 0 ? <div title="num produced" className={styles.eventProduce}>{numProduced}</div> : null}
        </div> : null}
        <div className={styles.kindLabel}>{data.kind}</div>
        <div className={styles.componentTitle}>
          {title(data)}
        </div>
        {runState === NodeRunState.None && events.length > 0 ?
          <div title="has events" className={classNames(styles.componentSummaryAlert, styles.hasEventsAlert)}>{icon.run_white}</div> : null}
        {runState === NodeRunState.Error ?
          <div title="error during run" className={classNames(styles.componentSummaryAlert, styles.runErrorAlert)}>{icon.exclamation_white}</div> : null}
        {runState === NodeRunState.NeedsMock ?
          <div title="action needed to run" className={classNames(styles.componentSummaryAlert, styles.needsMockAlert)}>{icon.exclamation_white}</div> : null}
        {runState === NodeRunState.IsMocked ?
          <div title="component is mocked" className={classNames(styles.componentSummaryAlert, styles.isMockedAlert)}>{icon.run_white}</div> : null}
        {data.lintErrors ? <div title="linting errors" className={styles.hasLintsAlert}>{icon.exclamation_white}</div> : null}
        {getLogo(data.type || '')}
        {data.hasSource && <Handle
          isConnectable={false}
          style={{ opacity: sourceHandleDisplayStyle }}
          type="source"
          position={data.hasSource}
        />}
        {isNotSelected ? activatedActionButtons(selectedNode, data) : null}
      </div>
    </>
  );
});
