package interpreter

const (
	FindFunction = `
function find(arg1, arg2) {
    var self = (this != null)
        ? this
        : value;
    var results = findGeneric(self, arg1, arg2, true);
    if (results.length > 0)
        return results[0];
    return undefined;
}
function findAll(arg1, arg2) {
    var self = (this != null)
        ? this
        : value;
    var results = findGeneric(self, arg1, arg2, false);
    return results;
}
Object.prototype.find = find;
Object.prototype.findAll = findAll;
function findGeneric(self, arg1, arg2, returnFirstResult) {
    var ignoreCase = Boolean(arg2);
    var caseSensitive = !ignoreCase;
    if (typeof arg1 == 'string') {
        var propertyName = String(arg1);
        return findByName(self, propertyName, caseSensitive, returnFirstResult);
    }
    else if (typeof arg1 == 'function') {
        var isMatch = arg1;
        return findByCallback(self, isMatch, returnFirstResult);
    }
    else if (typeof arg1 == 'object') {
        var pattern = arg1;
        return findByPattern(self, pattern, caseSensitive, returnFirstResult);
    }
    else {
        throw new Error('first parameter of find() must be: string, or function, or pattern object');
    }
}
function findByName(obj, propertyName, caseSensitive, returnFirstResult) {
    var isMatch = caseSensitive
        ? function (_, prop) { return prop == propertyName; }
        : function (_, prop) { return String(prop).toUpperCase() == propertyName.toUpperCase(); };
    return findByCallback(obj, isMatch, returnFirstResult);
}
function findByCallback(obj, isMatch, returnFirstResult) {
    var ctx = {
        isMatch: isMatch,
        currentPath: [],
        results: [],
        returnFirstResult: returnFirstResult,
    };
    findElement(ctx, obj);
    return ctx.results.map(function (x) { return x.value; });
}
function findByPattern(obj, patternObj, caseSensitive, returnFirstResult) {
    var log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
    };
    var isPatternMatch = function (obj, pattern) {
        if (typeof obj !== typeof pattern) {
            log("  type mismatch obj<>pattern: '" + typeof obj + "' != '" + typeof pattern + "'");
            return false;
        }
        for (var k in pattern) {
            var patternValue = pattern[k];
            if (typeof patternValue == 'function')
                continue;
            var objValue = obj[k];
            log("  [" + k + "]");
            if (typeof objValue !== typeof patternValue) {
                log("  property type mismatch: '" + typeof objValue + "' != '" + typeof patternValue + "'");
                return false;
            }
            if (typeof objValue === 'string') {
                if (caseSensitive) {
                    if (objValue != patternValue) {
                        log("  strings don't match (case sensitive): \"" + objValue + "\" != \"" + patternValue + "\"");
                        return false;
                    }
                }
                else {
                    if (String(objValue).toUpperCase() != String(patternValue).toUpperCase()) {
                        log("  strings don't match (ignore case): \"" + objValue + "\" != \"" + patternValue + "\"");
                        return false;
                    }
                }
            }
            else if (typeof objValue === 'boolean' || typeof objValue === 'number' || typeof objValue === 'undefined') {
                if (objValue != patternValue) {
                    log("  primitives not equal: " + objValue + " != " + patternValue);
                    return false;
                }
            }
            else {
                log("  -> descending into [" + k + "]");
                if (!isPatternMatch(objValue, patternValue))
                    return false;
            }
        }
        return true;
    };
    var ctx = {
        isMatch: isPatternMatch,
        pattern: patternObj,
        results: [],
        returnFirstResult: returnFirstResult,
    };
    findObject(ctx, obj);
    return ctx.results;
}
function findElement(ctx, obj) {
    for (var key in obj) {
        var value_1 = obj[key];
        if (typeof value_1 === 'function')
            continue;
        var isMatch = false;
        try {
            isMatch = ctx.isMatch(obj, key);
        }
        catch (_a) { }
        if (isMatch) {
            var clonedPath = Object.assign([], ctx.currentPath);
            ctx.results.push({ propertyName: key, path: clonedPath, value: value_1 });
            if (ctx.returnFirstResult)
                return true;
        }
        if (typeof value_1 === 'object') {
            ctx.currentPath.push(key);
            var stop = findElement(ctx, value_1);
            ctx.currentPath.pop();
            if (stop && ctx.returnFirstResult)
                return true;
        }
    }
    return false;
}
function findObject(ctx, obj) {
    if (ctx.isMatch(obj, ctx.pattern)) {
        ctx.results.push(obj);
        if (ctx.returnFirstResult)
            return true;
    }
    for (var key in obj) {
        var value_2 = obj[key];
        if (typeof value_2 !== 'object')
            continue;
        var stop = findObject(ctx, value_2);
        if (stop)
            return true;
    }
    return false;
}

`
)
