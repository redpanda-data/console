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

export const cullText = (str: string, length: number) => str.length > length ? `${str.substring(0, length - 3)}...` : str;



export function makePaginationConfig(pageSize: number = 20): PaginationConfig {
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






declare global {
    interface Array<T> {
        remove(obj: T): boolean;
        removeAll(selector: (x:T)=>boolean): number;
        sum<T>(this: T[], selector: (x: T) => number): number;
        any<T>(this: T[], selector: (x: T) => boolean): boolean;
        all<T>(this: T[], selector: (x: T) => boolean): boolean;
        groupBy<T, K>(this: T[], selector: (x: T) => K): Map<K, T[]>;
        distinct<T>(this: T[], keySelector?: ((x: T) => any)): T[];
    }
}

Array.prototype.remove = function remove<T>(this: T[], obj: T): boolean {
    const index = this.indexOf(obj);
    if (index === -1) return false;
    this.splice(index, 1);
    return true;
};

Array.prototype.removeAll = function removeAll<T>(this: T[], selector: (x:T)=>boolean): number {
    let count = 0;
    for(let i=0; i<this.length; i++){
        if(selector(this[i])) {
            this.splice(i, 1);
            count++;
        }
    }
    return count;
};

Array.prototype.sum = function sum<T>(this: T[], selector: (x: T) => number) {
    return this.reduce((pre, cur) => pre + selector(cur), 0);
};

Array.prototype.any = function any<T>(this: T[], selector: (x: T) => boolean) {
    for (let e of this) {
        if (selector(e))
            return true;
    }
    return false;
};

Array.prototype.all = function all<T>(this: T[], selector: (x: T) => boolean) {
    for (let e of this) {
        if (!selector(e))
            return false;
    }
    return true;
};

Array.prototype.groupBy = function groupBy<T, K>(this: T[], keySelector: (x: T) => K): Map<K, T[]> {
    const map = new Map();
    this.forEach(item => {
        const key = keySelector(item);
        const collection = map.get(key);
        if (!collection) {
            map.set(key, [item]);
        } else {
            collection.push(item);
        }
    });
    return map;
};


Array.prototype.distinct = function distinct<T>(this: T[], keySelector?: (x: T) => any): T[] {
    const selector = keySelector ? keySelector : (x: T) => x;

    const set = new Set<any>();
    const ar: T[] = [];

    this.forEach(item => {
        const key = selector(item);
        if (!set.has(key)) {
            set.add(key);
            ar.push(item);
        }
    });

    return ar;
};


export function range(start: number, end: number): number[] {
    const ar = []
    for (let i = start; i < end; i++)
        ar.push(i);
    return ar;
}