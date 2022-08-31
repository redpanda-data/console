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

/*
 For local debugging after `npm run build`

 > node --inspect ./scripts/serve.mjs

 */

import express from 'express';
import { join, dirname } from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

const port = 3000;
const rootDir = join(__dirname, '..', 'build');
const apiServer = 'http://localhost:9090';

app.use(express.static(rootDir));

app.use('/api/*', async function (req, res) {

    const url = apiServer + req.baseUrl;
    // console.log('api request will be proxied', { targetUrl: url });

    const proxied = await fetch(url, {
        method: req.method,
        body: req.body,
        // headers: req.headers,
    });

    res.statusCode = proxied.status;
    res.statusMessage = proxied.statusText;

    const banned = ['connection', 'content-encoding', 'content-length', 'content-type'];
    for (const [k, v] of proxied.headers) {
        if (banned.includes(k.toLowerCase()))
            continue;
        res.header(k, v);
    }

    if (proxied.body) {
        const json = await proxied.text();
        res.send(json);
    } else {
        res.end();
    }
});

app.get('/*', function (req, res) {
    res.sendFile(join(rootDir, 'index.html'));
});

app.listen(port, () => {
    console.log('will serve from directory: ' + rootDir);
    console.log('listening on port ' + port);
});