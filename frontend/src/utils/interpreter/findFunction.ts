
// run this in the kowl root folder:
//   tsc --outDir ./frontend/src/utils/compiled --removeComments --pretty false  frontend/src/utils/findFunction.ts
//
// or in: frontend/src/utils/interpreter
//   tsc --outDir ./compiled --removeComments --pretty false ./findFunction.ts

declare var value: any; // set/injected by backend

// declare function find(propName: string, ignoreCase?:boolean): any;
// declare function find(isMatch: (obj:object|Array<any>)=>boolean): any;
function find(this: any | undefined, arg1: any, arg2: any): any {
    const self = (this != null)
        ? this // called on object
        : value; // called in root

    const results = findGeneric(self, arg1, arg2, true);

    if (results.length > 0)
        return results[0].value;
    return undefined;
}

// declare function findAll(propName: string, ignoreCase?:boolean): any[];
// declare function findAll(isMatch: (obj:object|Array<any>)=>boolean): any[];
function findAll(this: any | undefined, arg1: any, arg2: any): any {
    const self = (this != null)
        ? this // called on object
        : value; // called in root

    const results = findGeneric(self, arg1, arg2, false);

    return results.map(x => x.value);
}

// add find methods to all objects
(Object.prototype as any).find = find;
(Object.prototype as any).findAll = findAll;




// calls findByName or findByCallback depending on the arguments
function findGeneric(self: any, arg1: any, arg2: any, returnFirstResult: boolean): FoundProperty[] {

    if (typeof arg1 == 'string') {
        // arg2 is 'ignoreCase?:boolean'
        const ignoreCase = Boolean(arg2);
        const caseSensitive = !ignoreCase;
        return findByName(self, arg1, caseSensitive, returnFirstResult);
    }
    else if (typeof arg1 == 'function') {
        return findByCallback(self, arg1, returnFirstResult);
    }
    else {
        throw new Error('first parameter of find() must be either a string or function');
    }
}


function findByName(obj: any, propertyName: string, caseSensitive: boolean, returnFirstResult: boolean): FoundProperty[] {
    const isMatch = caseSensitive
        ? (_: any, prop: string | number) => prop == propertyName
        : (_: any, prop: string | number) => String(prop).toUpperCase() == propertyName.toUpperCase();

    return findByCallback(obj, isMatch, returnFirstResult);
}

function findByCallback(obj: any, isMatch: (object: any, key: string | number) => boolean, returnFirstResult: boolean): FoundProperty[] {
    const ctx: PropertySearchContext = {
        isMatch: isMatch,
        currentPath: [],
        results: [],
        returnFirstResult: returnFirstResult,
    };

    findElement(ctx, obj);
    return ctx.results;
}


type FoundProperty = { propertyName: string, path: string[], value: any }
type PropertySearchContext = { isMatch: (currentObject: any, key: string | number) => boolean, currentPath: string[], results: FoundProperty[], returnFirstResult: boolean }

// returns 'shouldStop'
// true  -> stop
// false -> continue
function findElement(ctx: PropertySearchContext, obj: any): boolean {
    for (const key in obj) {

        const value = obj[key];
        if (typeof value === 'function') continue;


        // Check if property is a match
        let isMatch = false;
        try { isMatch = ctx.isMatch(obj, key); } catch { }

        if (isMatch) {
            const clonedPath = (<any>Object).assign([], ctx.currentPath);
            ctx.results.push({ propertyName: key, path: clonedPath, value: value });

            if (ctx.returnFirstResult)
                return true;
        }

        // Descend into object
        if (typeof value === 'object') {
            ctx.currentPath.push(key);
            const stop = findElement(ctx, value);
            ctx.currentPath.pop();

            if (stop && ctx.returnFirstResult)
                return true;
        }
    }

    return false;
}
