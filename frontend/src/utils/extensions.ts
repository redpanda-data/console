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

/* eslint-disable no-extend-native */

export { }

declare global {
    interface String {
        removePrefix(this: string, prefix: string): string;
        removeSuffix(this: string, suffix: string): string;
    }
}


String.prototype.removePrefix = function (this: string, prefix: string) {
    if (prefix.length === 0) return this;

    if (this.toLowerCase().startsWith(prefix.toLowerCase()))
        return this.substr(prefix.length);
    return this;
}

String.prototype.removeSuffix = function (this: string, suffix: string) {
    if (suffix.length === 0) return this;

    if (this.toLowerCase().endsWith(suffix.toLowerCase()))
        return this.substr(0, this.length - suffix.length);
    return this;
}

