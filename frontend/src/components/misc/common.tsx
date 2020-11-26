import React, { FC, Props, CSSProperties, Component } from "react";
import { PropsWithChildren } from "react";
import { TablePaginationConfig } from "antd/lib/table";
import { uiSettings } from "../../state/ui";
import { CompareFn } from "antd/lib/table/interface";
import Draggable from "react-draggable";
import { observer } from "mobx-react";
import { Grid, Modal, Tag } from "antd";
import { uiState } from "../../state/uiState";
import { hoursToMilliseconds } from "../../utils/utils";
import env from "../../utils/env";

const { useBreakpoint } = Grid;


const renderCount = new Map<string, number>();
export const RenderTrap: FC<{ name: string }> = ({ name }) => {
    let currentCount = renderCount.get(name) || 0;
    currentCount += 1;
    renderCount.set(name, currentCount);

    // if (currentCount > 1) {
    // 	console.log(`Rendered [${name}]: ${currentCount}`);
    // }

    return null;
}

//export const Section = memo<PropsWithChildren<{ title: string }>>(p =>
export const Section = ((p: PropsWithChildren<{ title: string }>) =>
    <section style={{ padding: '1em 2em' }}>
        <h2>{p.title}</h2>
        <div>{p.children}</div>
    </section>
)

export const WhiteCard = (p: PropsWithChildren<{ style?: React.CSSProperties, title?: string }>) =>
    <div style={{ margin: '1em 2em', padding: '2em 2em', borderRadius: 4, background: 'white', boxShadow: '0em 0em 1em #0002', ...p.style }}  >
        {p.title && <h2 style={{ borderBottom: '1px solid #0002' }}>{p.title}</h2>}
        <div>
            {p.children}
        </div>
    </div>


const dragBoxStyle: CSSProperties = {
    position: 'absolute', right: 0, zIndex: 9999,
    margin: '4px', marginRight: '20px',
    minWidth: '200px', display: 'flex', flexDirection: 'column', placeContent: 'center',
    borderRadius: '3px', background: 'hsl(205, 20%, 20%)', color: '#eee', opacity: 0.8
};
export const DebugDisplay = observer(() => {
    const screens = useBreakpoint();

    return <Draggable bounds="parent" handle='.title'>
        <div style={dragBoxStyle}>
            <div className='title' style={{ textAlign: 'center', padding: '6px', paddingBottom: '6px', borderBottom: '1px solid #aaa6', cursor: 'default', userSelect: 'none' }}>Debug</div>
            <div style={{ padding: '8px', }}>
                Breakpoints:{' '}
                {Object.entries(screens)
                    .filter(screen => !!screen[1])
                    .map(screen => (
                        <Tag color="blue" key={screen[0]}>
                            {screen[0]}
                        </Tag>
                    ))}
            </div>
        </div>
    </Draggable>
})


function constant(constantValue: JSX.Element): () => JSX.Element {
    return () => constantValue
}

export const Spacer = constant(<span style={{ display: 'flex', flexGrow: 1 }} />)


export const DEFAULT_TABLE_PAGE_SIZE = 50;
export function makePaginationConfig(pageSize: number = DEFAULT_TABLE_PAGE_SIZE, hideOnSinglePage?: boolean): TablePaginationConfig {
    return {
        position: ['none' as any, 'bottomRight'],
        pageSize: pageSize,

        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (total: number) => `Total ${total} items`,
        hideOnSinglePage: hideOnSinglePage ?? false,
    };
}


export function sortField<T, F extends keyof T>(field: F): CompareFn<T> {
    return (a: T, b: T, _) => {
        if (typeof a[field] === 'string') {
            const left = String(a[field]);
            const right = String(b[field]);
            return left.localeCompare(right);
        }
        if (typeof a[field] === 'number') {
            const left = +a[field];
            const right = +b[field];
            return left - right;
        }

        throw Error(`Table 'sortField()' can't handle '${field}', it's type is '${typeof a[field]}'`)
    }
}

export function range(start: number, end: number): number[] {
    const ar = []
    for (let i = start; i < end; i++)
        ar.push(i);
    return ar;
}

@observer
export class UpdatePopup extends Component {
    render() {
        if (!uiState.serverVersion) return null; // server version not known yet
        if (uiState.serverVersion == 'dev') return null; // don't show popup in dev
        console.log('popup: new version available');
        if (uiState.updatePromtHiddenUntil !== undefined)
            if (new Date().getTime() < uiState.updatePromtHiddenUntil)
                return null; // not yet
        console.log('popup: not "dismissed until time"');

        const curVersion = (!!env.REACT_APP_KOWL_GIT_SHA ? env.REACT_APP_KOWL_GIT_SHA : 'null (dev)') + " " + env.REACT_APP_KOWL_BUSINESS_GIT_SHA;

        return <Modal title='New version available'
            visible={true}
            okText='Update, reload the page!' cancelText="No, ignore for now"
            mask={true} closable={false} maskClosable={false} centered={true} keyboard={false}
            onCancel={() => uiState.updatePromtHiddenUntil = new Date().getTime() + hoursToMilliseconds(4)}
            onOk={() => window.location.reload()}
        >
            <p>It is reccommended to reload the page so the frontend uses the same version.</p>
            <p>
                <span>Current Version: <span className='codeBox'><code>{curVersion}</code></span></span><br />
                <span>Server Version: <span className='codeBox'><code>{uiState.serverVersion}</code></span></span>
            </p>
            <p>Do you want to reload the page now?</p>
        </Modal>
    }
}

