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
  // `this` is null when called in root, otherwise the object it was called on
  const self = this === null ? value : this;

  const results = findGeneric(self, arg1, arg2, true);

  if (results.length > 0) {
    return results[0];
  }
}

// declare function findAll(propName: string, ignoreCase?:boolean): any[];
// declare function findAll(isMatch: (obj:object|Array<any>)=>boolean): any[];
// declare function findAll(pattern: object, ignoreCase?:boolean): object[];
function findAll(this: unknown | undefined, arg1: unknown, arg2: unknown): unknown[] {
  // `this` is null when called in root, otherwise the object it was called on
  const self = this === null ? value : this;

  const results = findGeneric(self, arg1, arg2, false);

  return results;
}

// add find methods to all objects
(Object.prototype as Record<string, unknown>).find = find;
(Object.prototype as Record<string, unknown>).findAll = findAll;

// calls findByName or findByCallback depending on the arguments
function findGeneric(self: unknown, arg1: unknown, arg2: unknown, returnFirstResult: boolean): unknown[] {
  // a truthy second argument means ignoreCase
  const caseSensitive = !arg2;

  if (typeof arg1 === 'string') {
    // findByName
    return findByName(self, String(arg1), caseSensitive, returnFirstResult);
  }
  if (typeof arg1 === 'function') {
    // findByCallback
    return findByCallback(self, arg1 as (object: unknown, key: string | number) => boolean, returnFirstResult);
  }
  if (typeof arg1 === 'object' && arg1 !== null) {
    // findByPattern
    return findByPattern(self, arg1 as object, caseSensitive, returnFirstResult);
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

const logPatternMatch: (...args: unknown[]) => void = IsDev
  ? // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.debug
  : (..._args: unknown[]) => {
      /* do nothing */
    };

type PatternMatchOptions = { caseSensitive: boolean };

function stringsMatch(currentObjValue: string, patternValue: unknown, options: PatternMatchOptions): boolean {
  if (options.caseSensitive) {
    if (currentObjValue !== patternValue) {
      logPatternMatch(`  strings don't match (case sensitive): "${currentObjValue}" != "${patternValue}"`);
      return false;
    }
  } else if (String(currentObjValue).toUpperCase() !== String(patternValue).toUpperCase()) {
    logPatternMatch(`  strings don't match (ignore case): "${currentObjValue}" != "${patternValue}"`);
    return false;
  }
  return true;
}

function primitivesMatch(currentObjValue: unknown, patternValue: unknown): boolean {
  if (currentObjValue !== patternValue) {
    logPatternMatch(`  primitives not equal: ${currentObjValue} != ${patternValue}`);
    return false;
  }
  return true;
}

// Values of the same type: strings and primitives compare, objects recurse, anything else matches.
function patternValueMatches(
  currentObjValue: unknown,
  patternValue: unknown,
  key: string,
  options: PatternMatchOptions
): boolean {
  if (typeof currentObjValue === 'string') {
    // Compare string
    return stringsMatch(currentObjValue, patternValue, options);
  }
  if (
    typeof currentObjValue === 'boolean' ||
    typeof currentObjValue === 'number' ||
    typeof currentObjValue === 'undefined'
  ) {
    // Compare primitive
    return primitivesMatch(currentObjValue, patternValue);
  }
  if (
    typeof currentObjValue === 'object' &&
    currentObjValue !== null &&
    typeof patternValue === 'object' &&
    patternValue !== null
  ) {
    // Compare object
    logPatternMatch(`  -> descending into [${key}]`);
    return isPatternMatch(currentObjValue as object, patternValue as object, options);
  }
  return true;
}

function patternPropertyMatches(
  currentObj: object,
  currentPattern: object,
  key: string,
  options: PatternMatchOptions
): boolean {
  const patternValue = (currentPattern as Record<string, unknown>)[key];

  // don't require objects to have the same functions
  // todo: later we might want to have special functions that can compare against the actual value!
  //       isSet, notNull, lengthGt(5), isEmpty, compare('literal', ignoreCase), ...
  if (typeof patternValue === 'function') {
    return true;
  }

  const currentObjValue = (currentObj as Record<string, unknown>)[key];
  logPatternMatch(`  [${key}]`);

  if (typeof currentObjValue !== typeof patternValue) {
    logPatternMatch(`  property type mismatch: '${typeof currentObjValue}' != '${typeof patternValue}'`);
    return false;
  }

  return patternValueMatches(currentObjValue, patternValue, key, options);
}

function isPatternMatch(currentObj: object, currentPattern: object, options: PatternMatchOptions): boolean {
  if (typeof currentObj !== typeof currentPattern) {
    logPatternMatch(`  type mismatch obj<>pattern: '${typeof currentObj}' != '${typeof currentPattern}'`);
    return false;
  }

  for (const k in currentPattern) {
    if (Object.hasOwn(currentPattern, k) && !patternPropertyMatches(currentObj, currentPattern, k, options)) {
      return false;
    }
  }
  return true;
}

function findByPattern(
  obj: unknown,
  patternObj: object,
  caseSensitive: boolean,
  returnFirstResult: boolean
): unknown[] {
  const options: PatternMatchOptions = { caseSensitive };
  const ctx: ObjectSearchContext = {
    isMatch: (currentObj, currentPattern) => isPatternMatch(currentObj, currentPattern, options),
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

// the match function may throw, which counts as no match
function matchesSafely(ctx: PropertySearchContext, obj: object, key: string): boolean {
  try {
    return ctx.isMatch(obj, key);
  } catch {
    return false;
  }
}

// records the property when it matches; returns whether it did
function recordIfMatch(ctx: PropertySearchContext, obj: object, key: string, propValue: unknown): boolean {
  if (!matchesSafely(ctx, obj, key)) {
    return false;
  }
  const clonedPath = Object.assign([], ctx.currentPath);
  ctx.results.push({ propertyName: key, path: clonedPath, value: propValue });
  return true;
}

function descendInto(ctx: PropertySearchContext, key: string, propValue: unknown): boolean {
  ctx.currentPath.push(key);
  const stop = findElement(ctx, propValue);
  ctx.currentPath.pop();
  return stop && ctx.returnFirstResult;
}

// returns 'shouldStop' for a single property of `obj`
function visitProperty(ctx: PropertySearchContext, obj: object, key: string): boolean {
  const propValue = (obj as Record<string, unknown>)[key];
  if (typeof propValue === 'function') {
    return false;
  }

  // Check if property is a match
  if (recordIfMatch(ctx, obj, key, propValue) && ctx.returnFirstResult) {
    return true;
  }

  // Descend into object
  if (typeof propValue === 'object') {
    return descendInto(ctx, key, propValue);
  }
  return false;
}

// returns 'shouldStop'
// true  -> stop
// false -> continue
function findElement(ctx: PropertySearchContext, obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  for (const key in obj) {
    if (Object.hasOwn(obj, key) && visitProperty(ctx, obj, key)) {
      return true;
    }
  }

  return false;
}

function findObject(ctx: ObjectSearchContext, obj: unknown): boolean {
  if (typeof obj === 'object' && obj !== null && ctx.isMatch(obj as object, ctx.pattern)) {
    ctx.results.push(obj as object);
    if (ctx.returnFirstResult) {
      return true;
    }
  }

  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  return findInChildObjects(ctx, obj);
}

function findInChildObjects(ctx: ObjectSearchContext, obj: object): boolean {
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const propValue = (obj as Record<string, unknown>)[key];
      if (typeof propValue === 'object' && findObject(ctx, propValue)) {
        return true;
      }
    }
  }

  return false;
}
