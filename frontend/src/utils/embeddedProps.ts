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


export type EmbeddedProps = {
    // This will be used as the 'Authorization' header in every api request
    bearerToken: string;

    // This is the base url that is used:
    //   - when making api requests
    //   - to setup the 'basename' in react-router
    //
    // In the simplest case this would be the exact url where the host is running,
    // for example "http://localhost:3001/"
    //
    // When running in cloud-ui the base most likely need to include a few more
    // things like cluster id, etc...
    // So the base would probably be "https://cloud.redpanda.com/NAMESPACE/CLUSTER/"
    //
    basePath: string;
};

export const embeddedProps: EmbeddedProps = {
    bearerToken: '',
    basePath: '',
};
