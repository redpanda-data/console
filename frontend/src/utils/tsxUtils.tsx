import React, { Children, useState, Component, CSSProperties } from "react";
import { simpleUniqueId } from "./utils";
import { Radio } from 'antd';



const thousandsSeperator = (1234).toLocaleString()[1];

export function numberToThousandsString(n: number): JSX.Element {
    const parts = n.toLocaleString().split(thousandsSeperator);

    const result: JSX.Element[] = [];
    for (let i = 0; i < parts.length; i++) {
        const last = i == parts.length - 1;

        // Add the number block itself; React.Fragment is used explicitly to avoid missing key warning
        result.push(<React.Fragment key={i}>{parts[i]}</React.Fragment>);

        // Add a dot
        if (!last)
            result.push(<span key={i + '.'} className='noSelect'>{thousandsSeperator}</span>);
    }

    return <>{result}</>
}

export const ZeroSizeWrapper = (p: { width: number, height: number, children?: React.ReactNode }) => {
    return <span style={{
        width: p.width, height: p.height,
        display: 'inline-flex', placeContent: 'center', placeItems: 'center',

    }}>
        {p.children}
    </span>;
};


export const copyIcon = <svg viewBox="0 0 14 16" version="1.1" width="14" height="16" aria-hidden="true">
    <path fill-rule="evenodd" d="M2 13h4v1H2v-1zm5-6H2v1h5V7zm2 3V8l-3 3 3 3v-2h5v-2H9zM4.5 9H2v1h2.5V9zM2 12h2.5v-1H2v1zm9 1h1v2c-.02.28-.11.52-.3.7-.19.18-.42.28-.7.3H1c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h3c0-1.11.89-2 2-2 1.11 0 2 .89 2 2h3c.55 0 1 .45 1 1v5h-1V6H1v9h10v-2zM2 5h8c0-.55-.45-1-1-1H8c-.55 0-1-.45-1-1s-.45-1-1-1-1 .45-1 1-.45 1-1 1H3c-.55 0-1 .45-1 1z"></path></svg>


const DefaultQuickTableOptions = {
    tableClassName: undefined as string | undefined,
    keyAlign: 'left' as 'left' | 'right' | 'center',
    gutterWidth: '.5em' as string | number,
    gutterHeight: 0 as string | number,
    keyStyle: undefined as React.CSSProperties | undefined,
}
type QuickTableOptions = Partial<typeof DefaultQuickTableOptions>

export function QuickTable(data: { key: any, value: any }[], options?: QuickTableOptions): JSX.Element {
    const o: QuickTableOptions = {}; // create new options object (because we don't want to pollute the one the user gave us)

    {
        const oa = o as any;
        for (const k in DefaultQuickTableOptions) {
            //console.log("checking: " + k)
            if ((options as any)[k] == undefined) {
                oa[k] = (DefaultQuickTableOptions as any)[k];
                //console.log("     using default: " + oa[k])
            } else {
                oa[k] = (options as any)[k];
                //console.log("     using existing value: " + oa[k])
            }
        }
    }

    const showVerticalGutter = (typeof o.gutterHeight === 'number' && o.gutterHeight > 0) || typeof o.gutterHeight === 'string';

    return <table className={o.tableClassName}>
        <tbody>
            {data.map((obj, i) =>
                <React.Fragment key={i}>
                    <tr>
                        <td style={{ textAlign: o.keyAlign, ...o.keyStyle }}>{obj.key}</td>
                        <td style={{ paddingLeft: o.gutterWidth }}></td>
                        <td>{obj.value}</td>
                    </tr>

                    {showVerticalGutter && (i < data.length - 1) &&
                        <tr>
                            <td style={{ padding: 0, paddingBottom: o.gutterHeight }}></td>
                        </tr>
                    }
                </React.Fragment>
            )}
        </tbody>
    </table>
}

export function ObjToKv(obj: any): { key: string, value: any }[] {
    const ar = [] as { key: string, value: any }[];
    for (let k in obj) {
        ar.push({ key: k, value: obj[k] })
    }
    return ar;
}


const style_flexColumn: CSSProperties = { display: 'flex', flexDirection: 'column' };
export const Label = (p: { text: string, children?: React.ReactNode }) => {
    const [id] = useState(() => simpleUniqueId(p.text));

    const child: React.ReactNode = p.children ?? <React.Fragment />;

    const newChild = Object.assign({}, child) as any;
    newChild.props = {};
    Object.assign(newChild.props, (child as any).props, { id: id });

    return <>
        <div style={style_flexColumn}>
            <div className='labelText'>
                <label htmlFor={id}>{p.text}</label>
            </div>
            <div>
                {newChild}
            </div>
        </div>
    </>
}

export class OptionGroup<T> extends Component<{
    label?: string,
    options: { [key: string]: any },
    value: T,
    onChange: (value: T) => void,
    children?: never
}> {

    render() {
        const p = this.props;

        const radioGroup = (
            <Radio.Group value={p.value} onChange={e => p.onChange(e.target.value)}>
                {ObjToKv(p.options).map(kv =>
                    <Radio.Button key={kv.key} value={kv.value}>{kv.key}</Radio.Button>
                )}
            </Radio.Group>
        );

        if (!p.label) return radioGroup;

        return <Label text={p.label}>
            {radioGroup}
        </Label>
    }
}