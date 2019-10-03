import React, { FC, Props } from "react";
import { PropsWithChildren } from "react";
import { PaginationConfig, CompareFn } from "antd/lib/table";


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


function constant(constantValue: JSX.Element): () => JSX.Element {
    return () => constantValue
}

export const Spacer = constant(<span style={{ display: 'flex', flexGrow: 1 }} />)


export const DEFAULT_TABLE_PAGE_SIZE = 50;
export function makePaginationConfig(pageSize: number = DEFAULT_TABLE_PAGE_SIZE): PaginationConfig {
    return {
        position: 'bottom',
        pageSize: pageSize,

        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (total) => `Total ${total} items`,
        hideOnSinglePage: true,
    };
}


export function sortField<T, F extends keyof T>(field: F): CompareFn<T> {
    return (a: T, b: T, _) => {
        if (typeof a[field] === 'string') {
            const left = a[field] as unknown as string;
            const right = b[field] as unknown as string;
            return left.localeCompare(right);
        }
        if (typeof a[field] === 'number') {
            const left = a[field] as unknown as number;
            const right = b[field] as unknown as number;
            return left - right;
        }

        throw Error(`Table 'sortField()' can't handle '${field}'`)
    }
}






export function range(start: number, end: number): number[] {
    const ar = []
    for (let i = start; i < end; i++)
        ar.push(i);
    return ar;
}