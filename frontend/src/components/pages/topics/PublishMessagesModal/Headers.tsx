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

import { PlusIcon, TrashIcon } from '@primer/octicons-react';
import { observer } from 'mobx-react';
import './headersEditor.scss';
import { Button, Input } from '@redpanda-data/ui';

type Header = {
  key: string;
  value: string;
};

export type Props = {
  items: Header[];
};
const HeadersEditor = observer(
  (p: Props): JSX.Element => (
    <div className="headersEditor">
      <table>
        <thead>
          <tr>
            <th className="index">#</th>
            <th className="name">Header Name</th>
            <th className="value">Value</th>
            <th className="actions">Action</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((h, i) => (
            <HeaderComp header={h} index={i} key={String(i)} list={p.items} />
          ))}
        </tbody>
      </table>
      <Button
        onClick={() => {
          p.items.push({ key: '', value: '' });
        }}
        variant="outline"
        width="100%"
      >
        <span style={{ opacity: 0.66 }}>
          <PlusIcon size="small" />
        </span>
        Add Row
      </Button>
    </div>
  )
);
export default HeadersEditor;

const HeaderComp = observer((p: { list: Header[]; header: Header; index: number }) => {
  const { key, value } = p.header;
  return (
    <tr>
      <td className="index">{p.index + 1}</td>
      <td className="name">
        <Input
          borderRightRadius="0"
          onChange={(e) => (p.header.key = e.target.value)}
          placeholder="Key"
          spellCheck={false}
          value={key}
        />
      </td>
      <td className="value">
        <Input
          onChange={(e) => (p.header.value = e.target.value)}
          placeholder="Value"
          spellCheck={false}
          value={value}
        />
      </td>
      <td className="actions">
        <Button
          className="iconButton"
          onClick={(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            event.stopPropagation();
            p.list.remove(p.header);
          }}
          variant="ghost"
        >
          <TrashIcon size={20} />
        </Button>
      </td>
    </tr>
  );
});

/*


type bool = boolean;
type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

class MyClass {
    constructor(public name: string) { }
    sayHi() { console.log('hi ' + this.name); }
}

class HelperContainer<TEvent extends EventNames, TData> extends CustomEvent<TData> {
    constructor(name: TEvent, data: TData) {
        super(name, { detail: data });
    }
}

const customEvents = {
    "myClass": MyClass,
    "delete": {
        key: "" as string,
        state: 'before' as 'before' | 'after'
    }
};

type EventNames = keyof typeof customEvents;
type EventTypes<TName extends EventNames> = typeof customEvents[TName];

function dispatch<TEvent extends EventNames, TData extends EventTypes<TEvent>>(eventName: TEvent, data: TData) {
    const e = new CustomEvent(eventName, { detail: data });
    const preventDefault = dispatchEvent(e);
}

type CustomEventMap = {
    [N in EventNames]: CustomEvent<EventTypes<N>>;
};

declare global {
    interface WindowEventMap extends CustomEventMap {
    }
}

addEventListener('delete', ({ detail: e }) => {
    console.log(`I heard the delete event!! with id ${e.id} in state ${e.state}`);
});



// to optimize removing elements from list, so not every button in the list needs yet another handler with onClick={()=>...}
function useEvent<TName extends EventNames>(name: TName, listener: (event: EventTypes<TName>) => void): void {
    const realListener = useCallback(() => {
        console.log('creating the real listener (inside useCallback)');
        return ((event: CustomEvent<EventTypes<TName>>) => {
            listener(event.detail);
        }) as EventListener;

    }, []);

    useEffect(() => {
        // Register
        addEventListener(name, realListener);

        // Unregister
        return () => removeEventListener(name, realListener);
    }, [realListener]);
}

export interface NewTab {
    title: React.ReactNode | (() => React.ReactNode);
    content: React.ReactNode | (() => React.ReactNode);
    disabled?: boolean;
};
export interface NewTabsProps {
    tabs: { [key: string]: NewTab }

    selectedTabKey?: string;
    defaultSelectedTabKey?: string;
    onChange?: (selectedTabKey: string) => void;

    // Only makes sense when you also set "tabButtonStyle={{ maxWidth: '150px' }}".
    // Renders the given element in the empty space on the right.
    extra?: JSX.Element;

    // The wrapper around the whole tabs control, header bar and content.
    wrapperStyle?: CSSProperties;
    //
    barStyle?: CSSProperties;
    tabButtonStyle?: CSSProperties;
}

export function NewTabs(props: TabsProps) {
    const { tabs, selectedTabKey, extra, onChange = () => undefined } = props;

    const [selectedTab, setSelectedTab] = useState(selectedTabKey || props.defaultSelectedTabKey || props.tabs[0].key);

    dispatchEvent(new CustomEvent('ok', { detail: "whatever dude" }));

    return (
        <div style={props.wrapperStyle} >
            <nav>
                <ul className={styles.navigationList} style={props.barStyle}>
                    {tabs.map((tab) => (
                        <li key={tab.key} style={props.tabButtonStyle}>
                            <div className={`${selectedTab === tab.key ? styles.active : styles.tabHeaderButton} ${tab.disabled ? styles.disabled : ''}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (tab.disabled) return;
                                    setSelectedTab(tab.key);
                                    onChange(tab.key);
                                }}
                            >
                                {typeof tab.title === 'function' ? tab.title() : tab.title}
                            </div>
                        </li>
                    ))}
                    {extra && <li className='extra'>{extra}</li>}
                </ul>
            </nav>
            <article>{renderContent(tabs, selectedTab)}</article>
        </div>
    );
}

*/
