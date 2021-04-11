import React, { FC, Props, CSSProperties, Component } from "react";
import { PropsWithChildren } from "react";
import { TablePaginationConfig } from "antd/lib/table";
import { uiSettings } from "../../state/ui";
import { CompareFn } from "antd/lib/table/interface";
import Draggable from "react-draggable";
import { observer } from "mobx-react";
import { Grid, Modal, Tag } from "antd";
import { uiState } from "../../state/uiState";
import { hoursToMilliseconds, prettyMilliseconds } from "../../utils/utils";
import env, { IsBusiness, IsDev } from "../../utils/env";
import { QuickTable } from "../../utils/tsxUtils";
import { toJson } from "../../utils/jsonUtils";

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

        if ((typeof a[field] === 'undefined' || a[field] === null) && (typeof b[field] !== 'undefined' && b[field] !== null)) {
            const left = '';
            const right = String(b[field]);
            return left.localeCompare(right);
        }

        if ((typeof a[field] !== 'undefined' && a[field] !== null) && (typeof b[field] === 'undefined' || b[field] === null)) {
            const left = String(a[field]);
            const right = '';
            return left.localeCompare(right);
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

let updateDialogOpen = false;


@observer
export class UpdatePopup extends Component {
    render() {
        if (updateDialogOpen) return null;

        const serverVersion = uiState.serverVersion;
        if (!serverVersion) return null; // server version not known yet
        if (serverVersion.sha == 'dev' || serverVersion.branch == 'dev') return null; // don't show popup in dev
        if (uiState.updatePromtHiddenUntil !== undefined)
            if (new Date().getTime() < uiState.updatePromtHiddenUntil)
                return null; // not yet

        const curTimestamp = Number(env.REACT_APP_KOWL_TIMESTAMP);
        const serverTimestamp = Number(serverVersion.ts);

        if (!curTimestamp || !Number.isFinite(curTimestamp)) return null;
        if (!serverTimestamp || !Number.isFinite(curTimestamp)) return null;

        // don't downgrade
        if (serverTimestamp < curTimestamp) return null;

        console.log('frontend update available', {
            serverTimestamp: serverTimestamp,
            serverDate: new Date(serverTimestamp * 1000),
            serverVersionInfo: serverVersion,
            localTimestamp: curTimestamp,
            localDate: new Date(curTimestamp * 1000),
            localVersion: env,
        });

        updateDialogOpen = true;
        setImmediate(() => {
            Modal.info({
                title: 'Kowl has been updated',
                content: <div>The page must be reloaded to apply the newest version of the frontend.</div>,
                mask: true,
                maskClosable: false,
                centered: true,
                okText: 'Reload',
                onOk: () => {
                    console.log('reloading frontend...');
                    window.location.reload();
                    updateDialogOpen = false;
                },
                onCancel: () => { updateDialogOpen = false; }
            });
        });

        return null;

        /*
        const curSha = (!!env.REACT_APP_KOWL_GIT_SHA ? env.REACT_APP_KOWL_GIT_SHA : '(dev)');
        const curRef = env.REACT_APP_KOWL_GIT_REF;
        const curShaBusiness = env.REACT_APP_KOWL_BUSINESS_GIT_SHA;
        const curRefBusiness = env.REACT_APP_KOWL_BUSINESS_GIT_REF;
        const curTimestamp = env.REACT_APP_KOWL_TIMESTAMP;
        const isFree = !serverVersion.shaBusiness;

        const tableCurrent = {} as { [key: string]: any };
        const curTimestampDisplay = formatTimestamp(curTimestamp);
        if (curTimestampDisplay) tableCurrent['Built'] = curTimestampDisplay;
        tableCurrent['Git SHA'] = <span className='codeBox'>{curSha}</span>;
        if (curRef) tableCurrent['Release'] = <span className='codeBox'>{curRef}</span>;
        if (!isFree) {
            tableCurrent['Git SHA (Business)'] = <span className='codeBox'>{curShaBusiness}</span>;
            tableCurrent['Release (Business)'] = <span className='codeBox'>{curRefBusiness}</span>;
        }

        const tableServer = {} as { [key: string]: any };
        const serverTimestampDisplay = formatTimestamp(serverVersion.ts);
        if (serverTimestampDisplay) tableServer['Built'] = serverTimestampDisplay;
        tableServer['Git SHA'] = <span className='codeBox'>{!!serverVersion.sha ? serverVersion.sha : 'none (dev)'}</span>;
        if (serverVersion.branch) tableServer['Release'] = <span className='codeBox'>{serverVersion.branch}</span>;
        if (!isFree) {
            tableServer['Git SHA (Business)'] = <span className='codeBox'>{serverVersion.shaBusiness}</span>;
            tableServer['Release (Business)'] = <span className='codeBox'>{serverVersion.branchBusiness}</span>;
        }

        const versionTableStyle: CSSProperties = {
            background: 'hsl(0deg, 0%, 97%)',
            border: 'solid 1px hsla(0deg, 0%, 50%, 4%)',
            padding: '.8em 1em',
            borderRadius: '4px',
            fontFamily: 'Open Sans',
        };
        const versionHeaderStyle: CSSProperties = {
            fontSize: '90%',
            fontWeight: 600,
            color: 'hsl(0deg, 0%, 40%)',
            marginBottom: '0.5em',
        };
        const keyCellStyle: CSSProperties = {
            fontSize: '84%',
            color: 'hsl(0deg, 0%, 40%)',
        };

        return <Modal title='New version available'
            visible={true}
            okText='Update' cancelText="Ignore for now"
            mask={true} closable={false} maskClosable={false} centered={true} keyboard={false}
            onCancel={() => uiState.updatePromtHiddenUntil = new Date().getTime() + hoursToMilliseconds(4)}
            onOk={() => window.location.reload()}
            style={{ minWidth: '700px' }}
        >
            <p>
                The Kowl backend server is running a different version than the frontend.<br />
                It is reccommended to reload the page to update the frontend.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5em', margin: '1.5em 0' }}>
                <div style={versionTableStyle}>
                    <div style={versionHeaderStyle}>Current Version</div>
                    <div>{QuickTable(tableCurrent, { keyAlign: 'right', gapWidth: '6px', keyStyle: keyCellStyle, tableStyle: { margin: '0 1.5em' } })}</div>
                </div>

                <div style={versionTableStyle}>
                    <div style={versionHeaderStyle}>Server Version</div>
                    <div>{QuickTable(tableServer, { keyAlign: 'right', gapWidth: '6px', keyStyle: keyCellStyle, tableStyle: { margin: '0 1.5em' } })}</div>
                </div>
            </div>

            <div>
                <p>Do you want to reload the page now?</p>
            </div>
        </Modal>
        */
    }
}

function formatTimestamp(unixTimestampSeconds: number | string | null | undefined) {
    if (!unixTimestampSeconds) return null;

    const timestampMs = Number(unixTimestampSeconds) * 1000;
    if (isNaN(timestampMs)) return null;

    console.log('timestamp: ' + Number(unixTimestampSeconds));

    try {
        const date = new Date(timestampMs);
        return <><span className='codeBox'>{date.toUTCString()}</span> <span style={{ fontSize: '85%' }}>({prettyMilliseconds(Date.now() - date.getTime(), { compact: true })} ago)</span></>
    }
    catch (ex) {
        console.error('failed to parse/format the timestamp: ' + String(unixTimestampSeconds));
        return null;
    }
}