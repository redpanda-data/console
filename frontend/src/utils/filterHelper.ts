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


export function wrapFilterFragment(filterFragment: string) {
    if (!filterFragment.includes('return '))
        filterFragment = `return (${filterFragment})`;
    return filterFragment;
}

export function sanitizeString(input: string) {
    return input.split('')
        .map((char: string) => {
            const code = char.charCodeAt(0);
            if (code > 0 && code < 128) {
                return char;
            } else if (code >= 128 && code <= 255) {
                //Hex escape encoding
                return `/x${code.toString(16)}`.replace('/', '\\');
            }
            return '';
        })
        .join('');
}
