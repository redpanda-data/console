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

import { Button, Input, Tooltip } from '@redpanda-data/ui';
import { arrayMoveMutable } from 'array-move';
import { CloseIcon, MenuIcon } from 'components/icons';
import { useEffect, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult, type ResponderProvided } from 'react-beautiful-dnd';

const VALID_NAME_REGEX = /^[a-z][a-z_\d]*$/i;

// Keep stable reference to the latest onChange so useEffect doesn't re-run on every render
// but still calls the most recent version of the callback.
const useLatestRef = <T,>(value: T) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

type ItemProps = {
  item: { id: string };
  index: number;
  allItems: { id: string }[];
  onUpdate: (newId: string) => void;
  onDelete: () => void;
};

const Item = ({ item, allItems, onUpdate, onDelete }: ItemProps): JSX.Element => {
  const [hasFocus, setHasFocus] = useState(false);
  const [valuePending, setValuePending] = useState('');

  return (
    <>
      {/* Input */}
      <Tooltip hasArrow={true} isOpen={hasFocus} label="[Enter] confirm, [ESC] cancel" placement="top">
        <Input
          className="ghostInput"
          onBlur={() => {
            setHasFocus(false);
          }}
          onChange={(e) => setValuePending(e.target.value)}
          onFocus={() => {
            setValuePending(item.id);
            setHasFocus(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // can we rename that entry?
              if (allItems.some((x) => x.id === valuePending)) {
                // no, already exists
                e.stopPropagation();
                return;
              }

              if (VALID_NAME_REGEX.test(valuePending) === false) {
                // no, invalid characters
                e.stopPropagation();
                return;
              }

              onUpdate(valuePending);
              (e.target as HTMLElement).blur();
            } else if (e.key === 'Escape') {
              (e.target as HTMLElement).blur();
            }
          }}
          size="sm"
          spellCheck={false}
          style={{ flexGrow: 1, flexBasis: '400px' }}
          value={hasFocus ? valuePending : item.id}
        />
      </Tooltip>

      {/* Delete */}
      <button className="deleteButton" onClick={onDelete} type="button">
        <CloseIcon />
      </button>
    </>
  );
};

export function CommaSeparatedStringList(props: {
  defaultValue: string;
  onChange: (list: string) => void;
  locale?: {
    addInputPlaceholder?: string;
    addButtonText?: string;
  };
}) {
  const [data, setData] = useState<{ id: string }[]>(() =>
    props.defaultValue ? props.defaultValue.split(',').map((x) => ({ id: x.trim() })) : []
  );
  const [newEntry, setNewEntry] = useState<string | null>(null);
  const [newEntryError, setNewEntryError] = useState<string | null>(null);
  const onChangeRef = useLatestRef(props.onChange);

  useEffect(() => {
    onChangeRef.current(data.map((x) => x.id).join(','));
  }, [data, onChangeRef]);

  const updateItem = (index: number, newId: string) => {
    setData((prev) => prev.map((item, i) => (i === index ? { id: newId } : item)));
  };

  const deleteItem = (index: number) => {
    setData((prev) => prev.filter((_, i) => i !== index));
  };

  const reorderItems = (from: number, to: number) => {
    setData((prev) => {
      const next = [...prev];
      arrayMoveMutable(next, from, to);
      return next;
    });
  };

  return (
    <div className="stringList" style={{ maxWidth: '500px' }}>
      <div className="createEntryRow">
        <div className={`inputWrapper${newEntryError ? 'hasError' : ''}`} style={{ height: '100%' }}>
          <Input
            onChange={(e) => {
              const value = e.target.value;
              setNewEntry(value);
              setNewEntryError(null);

              if (!value) {
                return;
              }

              if (data.some((x) => x.id === value)) {
                setNewEntryError('Entry already exists');
              } else if (VALID_NAME_REGEX.test(value) === false) {
                setNewEntryError('Name is not valid (only letters, digits, underscore)');
              }
            }}
            placeholder={props.locale?.addInputPlaceholder ?? 'Enter a name...'}
            spellCheck={false}
            style={{ flexGrow: 1, height: '100%', flexBasis: '260px' }}
            value={newEntry ?? ''}
          />

          <div className="validationFeedback">{newEntryError ?? null}</div>
        </div>

        <Button
          disabled={newEntryError !== null || !newEntry || newEntry.trim().length === 0}
          onClick={() => {
            if (!newEntry) return;
            setData((prev) => [...prev, { id: newEntry }]);
            setNewEntry(null);
          }}
          style={{ padding: '0px 16px', height: '100%', minWidth: '120px' }}
          variant="solid"
        >
          Add
        </Button>
      </div>

      <List
        items={data}
        onReorder={reorderItems}
        renderItem={(item, index) => (
          <Item
            allItems={data}
            index={index}
            item={item}
            onDelete={() => deleteItem(index)}
            onUpdate={(newId) => updateItem(index, newId)}
          />
        )}
      />
    </div>
  );
}

type ListItemRendererProps<T extends { id: string }> = {
  item: T;
  index: number;
  renderItem: (item: T, index: number) => JSX.Element;
};

function ListItemRenderer<T extends { id: string }>({ item, index, renderItem }: ListItemRendererProps<T>) {
  return renderItem(item, index);
}

export function List<T extends { id: string }>(props: {
  items: T[];
  renderItem: (item: T, index: number) => JSX.Element;
  onReorder: (from: number, to: number) => void;
}) {
  const { items: list, renderItem, onReorder } = props;

  const onDragEnd = (result: DropResult, _provided: ResponderProvided) => {
    if (!result.destination) {
      return;
    }
    onReorder(result.source.index, result.destination.index);
  };

  return (
    <div className="reorderableList">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="droppable" ignoreContainerClipping={false}>
          {(droppableProvided, _droppableSnapshot) => (
            <div ref={droppableProvided.innerRef} style={{ display: 'flex', flexDirection: 'column' }}>
              {list.map((tag, index) => (
                <Draggable draggableId={String(index)} index={index} key={String(index)}>
                  {(draggableProvided, _draggableSnapshot) => (
                    <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps}>
                      <div className="draggableItem">
                        <div className="dragHandle" {...draggableProvided.dragHandleProps}>
                          <MenuIcon />
                        </div>
                        <ListItemRenderer index={index} item={tag} renderItem={renderItem} />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {droppableProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
