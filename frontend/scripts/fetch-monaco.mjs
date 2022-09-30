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

/**
 *
 * How to use this script: \
 * simply run `node scripts/fetch-monaco.mjs`
 *   available variables:
 *     MONACO_EDITOR_PATH the path where the vendor files are going to be downloaded default ./public/static/js/vendor/monaco
 *     MONACO_EDITOR_VERSION target version of monaco-editor you want to download default 0.33.0
 *
 * */

import { pipeline, PassThrough } from 'stream';
import fetch from 'node-fetch';
import fs from 'fs';
import zlib from 'zlib';
import * as tar from 'tar-stream';
import { promisify } from 'util';
import * as path from 'path';

const directory = process.env.MONACO_EDITOR_PATH ?? './public/static/js/vendor/monaco';
const version = process.env.MONACO_EDITOR_VERSION ?? '0.34.0';
const packageUrl = `https://registry.npmjs.org/monaco-editor/-/monaco-editor-${version}.tgz`;

const unzip = zlib.createUnzip();

const streamPipeline = promisify(pipeline);

function writeFile(directory, pathname, buffer, dirs) {
    pathname = path.join.apply(path, [].concat(directory.split('/'), pathname.split('/')));
    const paths = pathname.split(path.sep);

    for (let i = 1; i < paths.length; i++) {
        const dirpath = path.join.apply(path, [process.cwd()].concat(paths.slice(0, i)));
        if (!dirs[dirpath]) {
            !fs.existsSync(dirpath) && fs.mkdirSync(dirpath);
            dirs[dirpath] = true;
        }
    }

    fs.writeFileSync(path.join(process.cwd(), pathname), buffer, { mode: 0o777 });
    return dirs;
}

function writeFiles(directory, files) {
    Object.keys(files).reduce((dirs, pathname) => {
        return writeFile(directory, pathname, files[pathname], dirs);
    }, {});
}

function getTarStream() {
    const files = {};
    const extract = tar.extract();
    const tarStream = new PassThrough();

    extract.on('entry', (header, stream, cb) => {
        const buffers = [];
        stream.on('data', (chunk) => buffers.push(chunk));
        stream.on('end', () => {
            files[header.name] = Buffer.concat(buffers);
            cb();
        });
    });

    extract.on('finish', () => {
        writeFiles(directory, files);
    });

    tarStream.pipe(extract);

    return tarStream;
}

async function run() {
    const response = await fetch(packageUrl);
    if (!response.ok) throw new Error(`unexpected response ${response.statusText}`);

    await streamPipeline(response.body, unzip, getTarStream());
}

run().then(
    () => console.log(`Monaco version ${version} downloaded successfully in ${directory}`),
    (e) => console.error(e)
);
