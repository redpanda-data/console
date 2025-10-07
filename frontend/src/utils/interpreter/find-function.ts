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

//
// when in directory '/interpreter' run:
//   tsc --project ./tsconfig.json
//

import { IsDev } from '../env';

declare let value: unknown; // set/injected by backend

// declare function find(propName: string, ignoreCase?:boolean): any;
// declare function find(isMatch: (obj:object|Array<any>)=>boolean): any;
// declare function find(pattern: object, ignoreCase?:boolean): object|undefined;
function find(this: unknown | undefined, arg1: unknown, arg2: unknown): unknown {
  const self =
    this != null
      ? this // called on object
      : value; // called in root

  const results = findGeneric(self, arg1, arg2, true);

  if (results.length > 0) {
    return results[0];
  }
  return;
}

// declare function findAll(propName: string, ignoreCase?:boolean): any[];
// declare function findAll(isMatch: (obj:object|Array<any>)=>boolean): any[];
// declare function findAll(pattern: object, ignoreCase?:boolean): object[];
function findAll(this: unknown | undefined, arg1: unknown, arg2: unknown): unknown[] {
  const self =
    this != null
      ? this // called on object
      : value; // called in root

  const results = findGeneric(self, arg1, arg2, false);

  return results;
}

// add find methods to all objects
(Object.prototype as Record<string, unknown>).find = find;
(Object.prototype as Record<string, unknown>).findAll = findAll;

// calls findByName or findByCallback depending on the arguments
function findGeneric(self: unknown, arg1: unknown, arg2: unknown, returnFirstResult: boolean): unknown[] {
  const ignoreCase = Boolean(arg2);
  const caseSensitive = !ignoreCase;

  if (typeof arg1 === 'string') {
    // findByName
    const propertyName = String(arg1);
    return findByName(self, propertyName, caseSensitive, returnFirstResult);
  }
  if (typeof arg1 === 'function') {
    // findByCallback
    const isMatch = arg1;
    return findByCallback(self, isMatch, returnFirstResult);
  }
  if (typeof arg1 === 'object') {
    // findByPattern
    const pattern = arg1;
    return findByPattern(self, pattern, caseSensitive, returnFirstResult);
  }
  throw new Error('first parameter of find() must be: string, or function, or pattern object');
}

function findByName(obj: unknown, propertyName: string, caseSensitive: boolean, returnFirstResult: boolean): unknown[] {
  const isMatch = caseSensitive
    ? (_: unknown, prop: string | number) => prop === propertyName
    : (_: unknown, prop: string | number) => String(prop).toUpperCase() === propertyName.toUpperCase();

  return findByCallback(obj, isMatch, returnFirstResult);
}

function findByCallback(
  obj: unknown,
  isMatch: (object: unknown, key: string | number) => boolean,
  returnFirstResult: boolean
): unknown[] {
  const ctx: PropertySearchContext = {
    isMatch,
    currentPath: [],
    results: [],
    returnFirstResult,
  };

  findElement(ctx, obj);
  return ctx.results.map((x) => x.value);
}

function findByPattern(
  obj: unknown,
  patternObj: object,
  caseSensitive: boolean,
  returnFirstResult: boolean
): unknown[] {
  const log = IsDev
    ? // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.debug
    : (..._args) => {
        /* do nothing */
      };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 38, refactor later
  const isPatternMatch = (obj: object, pattern: object): boolean => {
    if (typeof obj !== typeof pattern) {
      log(`  type mismatch obj<>pattern: '${typeof obj}' != '${typeof pattern}'`);
      return false;
    }

    for (const k in pattern) {
      if (Object.hasOwn(pattern, k)) {
        const patternValue = (pattern as Record<string, unknown>)[k];

        // don't require objects to have the same functions
        // todo: later we might want to have special functions that can compare against the actual value!
        //       isSet, notNull, lengthGt(5), isEmpty, compare('literal', ignoreCase), ...
        if (typeof patternValue === 'function') {
          continue;
        }

        const objValue = (obj as Record<string, unknown>)[k];
        log(`  [${k}]`);

        if (typeof objValue !== typeof patternValue) {
          log(`  property type mismatch: '${typeof objValue}' != '${typeof patternValue}'`);
          return false;
        }

        if (typeof objValue === 'string') {
          // Compare string
          if (caseSensitive) {
            if (objValue !== patternValue) {
              log(`  strings don't match (case sensitive): "${objValue}" != "${patternValue}"`);
              return false;
            }
          } else if (String(objValue).toUpperCase() !== String(patternValue).toUpperCase()) {
            log(`  strings don't match (ignore case): "${objValue}" != "${patternValue}"`);
            return false;
          }
        } else if (typeof objValue === 'boolean' || typeof objValue === 'number' || typeof objValue === 'undefined') {
          // Compare primitive
          if (objValue !== patternValue) {
            log(`  primitives not equal: ${objValue} != ${patternValue}`);
            return false;
          }
        } else {
          // Compare object
          log(`  -> descending into [${k}]`);
          if (!isPatternMatch(objValue, patternValue)) {
            return false;
          }
        }
      }
    }
    return true;
  };

  const ctx: ObjectSearchContext = {
    isMatch: isPatternMatch,
    pattern: patternObj,
    results: [],
    returnFirstResult,
  };

  findObject(ctx, obj);
  return ctx.results;
}

type FoundProperty = { propertyName: string; path: string[]; value: unknown };
type PropertySearchContext = {
  isMatch: (currentObject: unknown, key: string | number) => boolean;
  currentPath: string[];
  results: FoundProperty[];
  returnFirstResult: boolean;
};

type ObjectSearchContext = {
  isMatch: (obj: object, pattern: object) => boolean;
  pattern: object;
  results: object[];
  returnFirstResult: boolean;
};

// returns 'shouldStop'
// true  -> stop
// false -> continue
function findElement(ctx: PropertySearchContext, obj: unknown): boolean {
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const value = obj[key];
      if (typeof value === 'function') {
        continue;
      }

      // Check if property is a match
      let isMatch = false;
      try {
        isMatch = ctx.isMatch(obj, key);
      } catch {
        // no op - match function may throw
      }

      if (isMatch) {
        const clonedPath = Object.assign([], ctx.currentPath);
        ctx.results.push({ propertyName: key, path: clonedPath, value });

        if (ctx.returnFirstResult) {
          return true;
        }
      }

      // Descend into object
      if (typeof value === 'object') {
        ctx.currentPath.push(key);
        const stop = findElement(ctx, value);
        ctx.currentPath.pop();

        if (stop && ctx.returnFirstResult) {
          return true;
        }
      }
    }
  }

  return false;
}

function findObject(ctx: ObjectSearchContext, obj: unknown): boolean {
  if (ctx.isMatch(obj, ctx.pattern)) {
    ctx.results.push(obj);
    if (ctx.returnFirstResult) {
      return true;
    }
  }

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const value = obj[key];
      if (typeof value !== 'object') {
        continue;
      }

      const stop = findObject(ctx, value);
      if (stop) {
        return true;
      }
    }
  }

  return false;
}
