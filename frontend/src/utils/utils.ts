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

import { makeObservable, observable } from 'mobx';
import prettyBytesOriginal from 'pretty-bytes';
import prettyMillisecondsOriginal from 'pretty-ms';
import { TopicMessage } from '../state/restInterfaces';
import { Base64 } from 'js-base64';

// Note: Making a <Memo> component is not possible, the container JSX will always render children first so they can be passed as props
export const nameof = <T>(name: Extract<keyof T, string>): string => name;


export class TimeSince {
    timestamp: number = Date.now();

    /** Reset timer back to 0 ms (or the given value). For example '1000' will set the timer as if it was started 1 second ago.  */
    reset(to: number = 0) {
        this.timestamp = Date.now() - to;
    }

    /** Time since last reset (or create) in ms */
    get value() {
        return Date.now() - this.timestamp;
    }
}

export class Cooldown {
    timestamp: number = 0; // time of last trigger
    duration: number = 0; // how long the CD takes to charge

    /**
     * @description Create a cooldown with the given duration
     * @param duration time the cooldown takes to complete in ms
     * @param start `running` to start 'on cooldown', `ready` to start already charged
     */
    constructor(duration: number, start: ('ready' | 'running') = 'running') {
        this.duration = duration;
        if (start === 'running') {
            this.timestamp = Date.now()
        }
    }

    /** Time (in ms) since the last time the cooldown was triggered */
    timeSinceLastTrigger(): number {
        return Date.now() - this.timestamp;
    }

    /** Time (in ms) until the cooldown is ready (or 0 if it is) */
    get timeLeft(): number {
        const t = this.duration - this.timeSinceLastTrigger();
        if (t < 0)
            return 0;
        return t;
    }

    // Check if ready
    get isReady(): boolean {
        return this.timeLeft <= 0;
    }

    // 'Use' the cooldown. Check if ready, and if it is also trigger it
    consume(force: boolean = false): boolean {
        if (this.timeLeft <= 0 || force) {
            this.timestamp = Date.now();
            return true;
        }
        return false;
    }

    // Force the cooldown to be ready
    setReady(): void {
        this.timestamp = 0;
    }

    // Same as 'consume(true)'
    restart(): void {
        this.timestamp = Date.now();
    }
}

export class Timer {
    target: number = 0;
    duration: number = 0;

    constructor(duration: number, initialState: ('started' | 'done') = 'started') {
        this.duration = duration;
        if (initialState === 'started') {
            this.target = Date.now() + duration;
        } else {
            this.target = 0;
        }
    }

    /** Time (in ms) until done (or 0) */
    get timeLeft() {
        const t = this.target - Date.now();
        if (t < 0)
            return 0;
        return t;
    }

    get isRunning() {
        return !this.isDone;
    }

    get isDone() {
        return this.timeLeft <= 0;
    }

    /** Restart timer */
    restart() {
        this.target = Date.now() + this.duration;
    }

    /** Set timer completed */
    setDone() {
        this.target = 0;
    }
}


export class DebugTimerStore {

    private static instance: DebugTimerStore;
    static get Instance() {
        if (!this.instance)
            this.instance = new DebugTimerStore();
        return this.instance;
    }

    @observable secondCounter = 0;
    @observable private frame = 0;

    private constructor() {
        this.increaseSec = this.increaseSec.bind(this);
        setInterval(this.increaseSec, 1000);

        this.increaseFrame = this.increaseFrame.bind(this);
        //setInterval(this.increaseFrame, 30);
        makeObservable(this);
    }

    private increaseSec() { this.secondCounter++; }
    private increaseFrame() { this.frame++; }

    public useSeconds() {
        this.mobxTrigger = this.secondCounter;
    }
    public useFrame() {
        this.mobxTrigger = this.frame;
    }

    mobxTrigger: any;
}


let refreshCounter = 0; // used to always create a different value, forcing some components to always re-render
export const alwaysChanging = () => refreshCounter = (refreshCounter + 1) % 1000;



export function assignDeep(target: any, source: any) {
    for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        if (key === '__proto__' || key === 'constructor') continue;

        const value = source[key];
        const existing = key in target ? target[key] : undefined;

        // if (existing === undefined && onlySetExisting) {
        // 	console.log('skipping key ' + key + ' because it doesnt exist in the target');
        // 	continue;
        // }

        if (typeof value === 'function' || typeof value === 'symbol') {
            //console.log('skipping key ' + key + ' because its type is ' + typeof value);
            continue;
        }

        if (typeof value === 'object') {

            if (!existing || typeof existing !== 'object')
                target[key] = value;
            else
                assignDeep(target[key], value);

            continue;
        }

        if (existing === value) continue;

        // console.log(`Key ["${key}"]:  ${JSON.stringify(existing)} ->  ${JSON.stringify(value)}`);

        target[key] = value;
    }

}

export function containsIgnoreCase(str: string, search: string): boolean {
    return str.toLowerCase().indexOf(search.toLowerCase()) >= 0;
}


const collator = new Intl.Collator(undefined, {
    usage: 'search',
    sensitivity: 'base',
});
export function equalsIgnoreCase(a: string, b: string) {
    return collator.compare(a, b) == 0;
}

type FoundProperty = { propertyName: string, path: string[], value: any }
type PropertySearchResult = 'continue' | 'abort';


type PropertySearchExContext = {
    isMatch: (propertyName: string, path: string[], value: any) => boolean,
    currentPath: string[],
    results: FoundProperty[],
    returnFirstResult: boolean
}

export function collectElements(obj: any, isMatch: (propertyName: string, path: string[], value: any) => boolean, returnFirstMatch: boolean): FoundProperty[] {
    const ctx: PropertySearchExContext = {
        isMatch: isMatch,
        currentPath: [],
        results: [],
        returnFirstResult: returnFirstMatch,
    };
    collectElementsRecursive(ctx, obj);
    return ctx.results;
}

function collectElementsRecursive(ctx: PropertySearchExContext, obj: any): PropertySearchResult {
    for (const key in obj) {

        const value = obj[key];

        // property match?
        const isMatch = ctx.isMatch(key, ctx.currentPath, value);

        if (isMatch) {
            const clonedPath = Object.assign([], ctx.currentPath);
            ctx.results.push({ propertyName: key, path: clonedPath, value: value });

            if (ctx.returnFirstResult) return 'abort';
        }

        // descend into object
        if (typeof value === 'object') {
            ctx.currentPath.push(key);
            const childResult = collectElementsRecursive(ctx, value);
            ctx.currentPath.pop();

            if (childResult == 'abort')
                return 'abort';
        }
    }

    return 'continue';
}



type IsMatchFunc = (pathElement: string, propertyName: string, value: any) => boolean;
export type CollectedProperty = { path: string[], value: any }

export function collectElements2(
    targetObject: any,

    // "**" collectes all current and nested properties
    // "*" collects all current properties
    // anything else is passed to "isMatch"
    path: string[],
    isMatch: IsMatchFunc
): CollectedProperty[] {

    // Explore set
    let currentExplore: CollectedProperty[] = [
        { path: [], value: targetObject },
    ];
    let nextExplore: CollectedProperty[] = [];
    const results: CollectedProperty[] = [];

    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        const isLast = i == (path.length - 1);
        const targetList = isLast ? results : nextExplore;

        for (const foundProp of currentExplore) {
            const currentObj = foundProp.value;

            switch (segment) {
                case '**':
                    // And all their nested objects are a result
                    const allNested = collectElements(currentObj, (_key, _path, value) => {
                        return typeof value == 'object';
                    }, false);

                    for (const n of allNested) {
                        targetList.push({
                            path: [...foundProp.path, ...n.path, n.propertyName],
                            value: n.value
                        });
                    }

                    // Also explore this object again as well (because '**' also includes the current props)
                    targetList.push({
                        path: [...foundProp.path],
                        value: currentObj,
                    });

                    break;

                case '*':
                    // Explore all properties
                    for (const key in currentObj) {
                        const value = currentObj[key];
                        if (value == null || typeof value == 'function') continue;

                        targetList.push({
                            path: [...foundProp.path, key],
                            value: value,
                        });
                    }
                    break;

                default:
                    // Some user defined string
                    for (const key in currentObj) {
                        const value = currentObj[key];
                        if (value == null || typeof value == 'function') continue;

                        const match = isMatch(segment, key, value);
                        if (match) {
                            targetList.push({
                                path: [...foundProp.path, key],
                                value: value,
                            });
                        }
                    }
                    break;
            }
        }

        // use the next array as the current one
        currentExplore = nextExplore;
        nextExplore = [];
    }

    return results;
}


export function getAllMessageKeys(messages: TopicMessage[]): Property[] {
    const ctx: GetAllKeysContext = {
        currentFullPath: '',
        currentPath: [],
        results: [],
        existingPaths: new Set<string>(),
    };

    // slice is needed because messages array is observable
    for (const m of messages.slice()) {
        const payload = m.value.payload;
        getAllKeysRecursive(ctx, payload);

        ctx.currentPath = [];
        ctx.currentFullPath = '';
    }

    // console.log('getAllMessageKeys', ctx.results);

    return ctx.results;
}


interface Property {
    /** property name */
    propertyName: string;
    /** path to the property (excluding 'prop' itself) */
    path: string[];
    /** path + prop */
    fullPath: string;
}
type GetAllKeysContext = {
    currentPath: string[], // complete, real path
    currentFullPath: string, // string path, with array indices replaced by a start
    existingPaths: Set<string>, // list of 'currentFullPath' entries, used to filter duplicates
    results: Property[],
}

function getAllKeysRecursive(ctx: GetAllKeysContext, obj: any): PropertySearchResult {
    const isArray = Array.isArray(obj);
    let result = 'continue' as PropertySearchResult;

    const pathToHere = ctx.currentFullPath;

    for (const key in obj) {
        const value = obj[key];

        ctx.currentPath.push(key);
        const currentFullPath = isArray
            ? pathToHere + '[*]'
            : pathToHere + `.${key}`;
        ctx.currentFullPath = currentFullPath;

        if (!isArray) { // add result, but only for object properties
            const isNewPath = !ctx.existingPaths.has(currentFullPath);
            if (isNewPath) { // and only if its a new path
                ctx.existingPaths.add(currentFullPath);

                const clonedPath = Object.assign([], ctx.currentPath);
                ctx.results.push({
                    propertyName: key,
                    path: clonedPath, // all the keys
                    fullPath: currentFullPath,
                });
            }
        }


        // descend into object
        if (typeof value === 'object' && value != null) {

            const childResult = getAllKeysRecursive(ctx, value);

            if (childResult == 'abort')
                result = 'abort';
        }

        ctx.currentPath.pop();
        ctx.currentFullPath = currentFullPath;

        if (result == 'abort') break;
    }

    ctx.currentFullPath = pathToHere;

    return result;
}



const secToMs = 1000;
const minToMs = 60 * secToMs;
const hoursToMs = 60 * minToMs;
// const daysToMs = 24 * hoursToMs;

export function hoursToMilliseconds(hours: number) {
    return hours * hoursToMs;
}

export const cullText = (str: string, length: number) => str.length > length ? `${str.substring(0, length - 3)}...` : str;

export function groupConsecutive(ar: number[]): number[][] {
    const groups: number[][] = [];

    for (const cur of ar) {
        const group = groups.length > 0 ? groups[groups.length - 1] : undefined;

        if (group) {
            const last = group[group.length - 1];
            if (last == cur - 1) {
                // We can extend the group
                group.push(cur);
                continue;
            }
        }

        groups.push([cur]);
    }

    return groups;
}

export const prettyBytesOrNA = function (n: number) {
    if (!isFinite(n) || n < 0) return 'N/A';
    return prettyBytes(n);
}


/**
 * Determines if two sets are equal.
 *
 * This function checks if two sets (xs and ys) have the same size and
 * the same elements. It assumes that the sets contain elements of type T.
 * Equality is determined by checking if every element in set xs is also
 * present in set ys.
 *
 * @template T - The type of elements in the sets.
 * @param {Set<T>} xs - The first set to be compared.
 * @param {Set<T>} ys - The second set to be compared.
 * @returns {boolean} - Returns `true` if the sets are equal, otherwise returns `false`.
 * @example
 * // returns true
 * eqSet(new Set([1, 2, 3]), new Set([3, 2, 1]));
 *
 * @example
 * // returns false
 * eqSet(new Set([1, 2, 3]), new Set([4, 5, 6]));
 */
export const eqSet = <T = string,>(xs: Set<T>, ys: Set<T>): boolean =>
    xs.size === ys.size &&
    [...xs].every((x) => ys.has(x));

export type PrettyValueOptions = {
    /** Show 'Infinite' for greater or equal to 2^64-1 */
    showLargeAsInfinite?: boolean;
    /** A fallback to show when the value is `undefined` or `null` */
    showNullAs?: string;
};
export const UInt64Max = '18446744073709551615'; // can't be represented in js, would be rounded up to 18446744073709552000
function isUInt64Maximum(str: string) {
    if (str == UInt64Max)
        return true;
    if (str == String(Number(UInt64Max)))
        return true;
    return false;
}

export const prettyBytes = function (n: number | string | null | undefined, options?: PrettyValueOptions) {
    if (typeof n === 'undefined' || n === null)
        return options?.showNullAs ?? 'N/A'; // null, undefined -> N/A

    if (options?.showLargeAsInfinite && isUInt64Maximum(String(n)))
        return 'Infinite';

    if (typeof n !== 'number') {
        if (typeof n === 'string') {
            // string
            if (n === '')
                return 'N/A'; // empty -> N/A

            n = parseFloat(String(n));

            if (!isFinite(n))
                return String(n); // "NaN" or "Infinity"

            // number parsed, fall through
        }
        else {
            // something else: object, function, ...
            return 'NaN';
        }
    }

    // n is a finite number
    return prettyBytesOriginal(n, { binary: true });
}

export const prettyMilliseconds = function (n: number | string, options?: prettyMillisecondsOriginal.Options & PrettyValueOptions) {
    if (typeof n === 'undefined' || n === null)
        return options?.showNullAs ?? 'N/A'; // null, undefined -> N/A

    if (options?.showLargeAsInfinite && isUInt64Maximum(String(n)))
        return 'Infinite';

    if (typeof n !== 'number') {
        if (typeof n === 'string') {
            // string
            if (n === '')
                return 'N/A'; // empty -> N/A

            n = parseFloat(String(n));

            if (!isFinite(n))
                return String(n); // "NaN" or "Infinity"

            // number parsed, fall through
        }
        else {
            // something else: object, function, ...
            return 'NaN';
        }
    }
    else {
        if (!isFinite(n)) return 'N/A';
    }

    // n is a finite number
    return prettyMillisecondsOriginal(n, options);
}

const between = (min: number, max: number) => (num: number) => num >= min && num < max;
const isK = between(1000, 1000000);
const isM = between(1000000, 1000000000);

const isInfinite = (num: number) => !isFinite(num);
const toK = (num: number) => `${(num / 1000).toFixed(1)}k`;
const toM = (num: number) => `${(num / 1000000).toFixed(1)}m`;
const toG = (num: number) => `${(num / 1000000000).toFixed(1)}g`;

export function prettyNumber(num: number) {
    if (isNaN(num) || isInfinite(num) || num < 1000) return String(num);
    if (isK(num)) return toK(num);
    if (isM(num)) return toM(num);
    return toG(num);
}

export function fromDecimalSeparated(str: string): number {
    if (!str || str === '') return 0;
    return parseInt(str.replace(',', ''));
}

export function toDecimalSeparated(num: number): string {
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * random digits and letters (entropy: 53bit)
 */
export function randomId() {
    return (Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
}

/**
 * "prefix-randomId()-randomId()"
 */
export function simpleUniqueId(prefix?: string) {
    return `${prefix}-${randomId()}-${randomId()}`;
}

/**
 * 4x 'randomId()'
 */
export function uniqueId4(): string {
    return randomId() + randomId() + randomId() + randomId();
}


export function titleCase(str: string): string {
    if (!str) return str;
    return str[0].toUpperCase() + str.slice(1).toLowerCase();
}


/**
 * Scroll the main content region
 */
export function scrollToTop(): void {
    const mainLayout = document.getElementById('mainLayout');
    if (!mainLayout) return;

    mainLayout.scrollTo({ behavior: 'smooth', left: 0, top: 0 });
}

/**
 * Scroll the main content region to the target element (which is found by the given id)
 */
export function scrollTo(targetId: string, anchor: 'start' | 'end' | 'center' = 'center', offset?: number): void {
    const mainLayout = document.getElementById('mainLayout');
    if (!mainLayout) return;
    const target = document.getElementById(targetId);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    let top = 0;
    switch (anchor) {
        case 'start': top = rect.top; break;
        case 'center': top = (rect.top + rect.bottom) / 2; break;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        case 'end': top = rect.bottom; break;
    }

    mainLayout.scrollTo({
        behavior: 'smooth',
        top: target.getBoundingClientRect().top + mainLayout.scrollTop + (offset ?? 0)
    });
}


// See: https://stackoverflow.com/questions/30106476/using-javascripts-atob-to-decode-base64-doesnt-properly-decode-utf-8-strings
export function decodeBase64(base64: string) {
    return Base64.decode(base64);
}

export function encodeBase64(rawData: string) {
    return Base64.encode(rawData);
}

export function base64ToHexString(base64: string): string {
    try {
        const binary = Base64.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i].toString(16);
            hex += b.length === 1 ? '0' + b : b;

            if (i < bytes.length - 1)
                hex += ' ';
        }

        return hex;
    }
    catch (err) {
        return '<<Unable to decode message>>';
    }
}

export function delay(timeoutMs: number): Promise<void> {
    return new Promise((resolve, _) => {
        setTimeout(resolve, timeoutMs);
    });
}


export function setHeader(init: RequestInit, name: string, value: string) {
    if (init.headers == null) {
        init.headers = [
            [name, value]
        ];
    }
    else if (Array.isArray(init.headers)) {
        init.headers.push([name, value]);
    }
    else if (typeof init.headers.set == 'function') {
        init.headers.set(name, value);
    } else {
        // Record<string, string>
        (init.headers as Record<string, string>)[name] = value;
    }
}

// very simple retrier utility for allowing some retries, if we ended up using it more often we should consider making it more elaborate
export function retrier<T>(operation: () => Promise<T>, { attempts = Infinity, delayTime = 100 }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        return operation()
            .then(resolve)
            .catch((reason: unknown) => {
                if (attempts > 0) {
                    return delay(delayTime)
                        .then(retrier.bind(null, operation, { attempts: attempts - 1, delayTime }))
                        .then(resolve as any)
                        .catch(reject);
                }
                reject(reason);
            });
    });
}

/**
 * https://stackoverflow.com/a/59187769 Extract the type of an element of an array/tuple without
 * performing indexing
 */
export type ElementOf<T> = T extends (infer E)[] ? E : T extends readonly (infer F)[] ? F : never;
