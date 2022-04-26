
export { };

declare global {
    interface Array<T> {
        remove(obj: T): boolean;
        removeAll(selector: (x: T) => boolean): number;

        first<T>(this: T[], selector?: (x: T) => boolean): T | undefined;
        last<T>(this: T[], selector?: (x: T) => boolean): T | undefined;

        count<T>(this: T[], selector: (x: T) => boolean): number;
        sum<T>(this: T[], selector: (x: T) => number): number;
        min<T>(this: T[], selector: (x: T) => number): number;
        max<T>(this: T[], selector: (x: T) => number): number;
        minBy<T>(this: T[], selector: (x: T) => number): T | undefined;
        maxBy<T>(this: T[], selector: (x: T) => number): T | undefined;

        any<T>(this: T[], selector: (x: T) => boolean): boolean;
        all<T>(this: T[], selector: (x: T) => boolean): boolean;

        /** group elements into a Map<> using the given key selector */
        groupBy<T, K>(this: T[], selector: (x: T) => K): Map<K, T[]>;
        /** groups elements (into an array of groups) using the given key selector */
        groupInto<T, K>(this: T[], selector: (x: T) => K): { key: K, items: T[] }[];

        /** returns a new array containing only distinct elements */
        distinct<T>(this: T[], keySelector?: ((x: T) => any)): T[];
        pushDistinct<T>(this: T[], ...elements: T[]): void;

        /**
         * returns an array containing all elements that are present in both this and the other array
         */
        intersection<T>(this: T[], other: T[]): T[];

        /**
         * returns a copy containing all elements except for those that are also in 'other'
         */
        except<T>(this: T[], other: T[]): T[];

        genericJoin<T>(this: T[], getSeparator: (last: T, current: T, index: number) => T): T[];
        /**
         * Like normal .join() but skips over empty, null, and undefined
         */
        joinStr(this: (string | null | undefined)[], separator: string): string;

        toMap<TItem, TKey, TValue>(this: TItem[], computeKey: (item: TItem) => TKey, computeValue: (item: TItem) => TValue): Map<TKey, TValue>;

        filterNull<T>(this: (T | null | undefined)[]): T[];
        filterFalsy<T>(this: (T | null | undefined)[]): T[];

        /**
         * Replace the content with the given data.
         * Intended to be used with mobx observable arrays, where setting the whole
         * array (even with identical contents) would notify all observers.
         *
         * This function instead computes the difference and adds/removes them.
         *
         * It is strongly reccomended to wrap calls to this in a mobx transaction() or similar.
         */
        updateWith<T>(this: T[], newData: T[]): { removed: number, added: number };


        isEqual(this: string[], other: string[]): boolean;
    }
}

Array.prototype.remove = function remove<T>(this: T[], obj: T): boolean {
    const index = this.indexOf(obj);
    if (index === -1) return false;
    this.splice(index, 1);
    return true;
};

Array.prototype.removeAll = function removeAll<T>(this: T[], selector: (x: T) => boolean): number {
    let count = 0;
    for (let i = 0; i < this.length; i++) {
        if (selector(this[i])) {
            this.splice(i, 1);
            count++;
            i--;
        }
    }
    return count;
};


Array.prototype.first = function first<T>(this: T[], selector?: (x: T) => boolean): T | undefined {
    if (!selector)
        return this.length > 0
            ? this[0]
            : undefined;

    for (const e of this)
        if (selector(e))
            return e;

    return undefined;
};

Array.prototype.last = function last<T>(this: T[], selector?: (x: T) => boolean): T | undefined {
    for (let i = this.length - 1; i >= 0; i--)
        if (!selector || selector(this[i]))
            return this[i];
    return undefined;
};

Array.prototype.count = function count<T>(this: T[], selector: (x: T) => boolean) {
    return this.reduce((pre, cur) => selector(cur) ? pre + 1 : pre, 0);
};

Array.prototype.sum = function sum<T>(this: T[], selector: (x: T) => number) {
    return this.reduce((pre, cur) => pre + selector(cur), 0);
};

Array.prototype.min = function min<T>(this: T[], selector: (x: T) => number) {
    let cur = Number.POSITIVE_INFINITY;

    for (let i = 0; i < this.length; i++) {
        const value = selector(this[i]);
        if (value < cur)
            cur = value;
    }

    return cur;
};

Array.prototype.max = function max<T>(this: T[], selector: (x: T) => number) {
    let cur = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < this.length; i++) {
        const value = selector(this[i]);
        if (value > cur)
            cur = value;
    }

    return cur;
};

Array.prototype.minBy = function minBy<T>(this: T[], selector: (x: T) => number) {
    if (this.length == 0) return undefined;

    let bestIndex = 0;
    let bestVal = selector(this[0]);

    for (let i = 1; i < this.length; i++) {
        const x = selector(this[i]);
        if (x < bestVal) {
            bestIndex = i;
            bestVal = x;
        }
    }

    return this[bestIndex];
};

Array.prototype.maxBy = function maxBy<T>(this: T[], selector: (x: T) => number) {
    if (this.length == 0) return undefined;

    let bestIndex = 0;
    let bestVal = selector(this[0]);

    for (let i = 1; i < this.length; i++) {
        const x = selector(this[i]);
        if (x > bestVal) {
            bestIndex = i;
            bestVal = x;
        }
    }

    return this[bestIndex];
};

Array.prototype.any = function any<T>(this: T[], selector: (x: T) => boolean) {
    return this.some(selector);
};

Array.prototype.all = function all<T>(this: T[], selector: (x: T) => boolean) {
    return this.every(selector);
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


Array.prototype.groupInto = function groupInto<T, K>(this: T[], keySelector: (x: T) => K): { key: K, items: T[] }[] {
    const map = this.groupBy(keySelector);

    const ar: { key: K, items: T[] }[] = [];
    map.forEach((items, key) => {
        ar.push({ key, items });
    });

    return ar;
};

Array.prototype.filterNull = function filterNull<T>(this: (T | null | undefined)[]): T[] {
    return this.filter(x => x != null) as T[];
};

Array.prototype.filterFalsy = function filterFalsy<T>(this: (T | null | undefined)[]): T[] {
    return this.filter(Boolean) as T[];
};

Array.prototype.updateWith = function updateWith<T>(this: T[], newData: T[]): { removed: number, added: number } {

    // Early out, compare both arrays
    if (this.length == newData.length) {
        let same = true;
        for (let i = 0; i < this.length; i++)
            if (this[i] != newData[i]) {
                same = false;
                break;
            }
        if (same) return { removed: 0, added: 0 };
    }

    const added = newData.except(this);
    const removed = this.except(newData);

    this.removeAll(x => removed.includes(x));
    for (const a of added)
        this.push(a);

    return { removed: removed.length, added: added.length };
};

Array.prototype.isEqual = function isEqual(this: string[], other: string[]): boolean {
    if (this.length == 0 && other.length == 0)
        return true;

    if (this.length != other.length)
        return false;

    for (let i = 0; i < this.length; i++)
        if (this[i] !== other[i])
            return false;

    return true;
};


Array.prototype.distinct = function distinct<T>(this: T[], keySelector?: (x: T) => any): T[] {
    if (!keySelector)
        return [...new Set(this)];

    const set = new Set<any>();
    const ar: T[] = [];

    this.forEach(item => {
        const key = keySelector(item);
        if (!set.has(key)) {
            set.add(key);
            ar.push(item);
        }
    });

    return ar;
};

Array.prototype.pushDistinct = function pushDistinct<T>(this: T[], ...elements: T[]): void {
    if (this.length + elements.length > 50) {
        const s = new Set(this);
        for (const e of elements)
            if (!s.has(e))
                this.push(e);
    }
    else {
        for (const e of elements)
            if (!this.includes(e))
                this.push(e);
    }
};

Array.prototype.intersection = function intersection<T>(this: T[], other: T[]): T[] {
    const thisSet = new Set<T>(this);
    const results: T[] = [];
    for (const e of other)
        if (thisSet.has(e))
            results.push(e);
    return results;
};

Array.prototype.except = function except<T>(this: T[], other: T[]): T[] {
    const ar = [];
    const otherSet = new Set<T>(other);
    for (const e of this) {
        if (otherSet.has(e)) continue;
        ar.push(e);
    }
    return ar;
};

Array.prototype.genericJoin = function genericJoin<T>(this: T[], getSeparator: (last: T, current: T, index: number) => T): T[] {
    const ar = [];
    for (let i = 1; i < this.length; i++) {
        const last = this[i - 1];
        const current = this[i];

        const separator = getSeparator(last, current, i);

        ar.push(last);
        ar.push(separator);
    }

    // add final element
    ar.push(this[this.length - 1]);

    return ar;
};

Array.prototype.toMap = function toMap<TItem, TKey, TValue>(this: TItem[], computeKey: (item: TItem) => TKey, computeValue: (item: TItem) => TValue): Map<TKey, TValue> {
    const map = new Map<TKey, TValue>();

    for (const item of this) {
        const key = computeKey(item);
        const value = computeValue(item);
        map.set(key, value);
    }

    return map;
};

Array.prototype.joinStr = function joinStr(this: (string | null | undefined)[], separator: string): string {
    let r = "";
    for (const str of this) {
        if (str === null || str === undefined || str === "")
            continue;

        if (r.length == 0)
            r = str;
        else
            r += (separator + str);
    }

    return r;
};


