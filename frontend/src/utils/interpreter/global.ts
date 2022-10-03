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


/*eslint @typescript-eslint/no-namespace: off */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare namespace NodeJS {
    interface Global {
        value: any;
    }
}

global.value = {};
