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

import { toJson } from './jsonUtils';
import './extensions';

const envNames = [
    'NODE_ENV',

    'NEXT_PUBLIC_CONSOLE_GIT_SHA',
    'NEXT_PUBLIC_CONSOLE_GIT_REF', // 'master' or 'v1.2.3'
    'NEXT_PUBLIC_BUILD_TIMESTAMP',
    'NEXT_PUBLIC_CONSOLE_PLATFORM_VERSION',

    'NEXT_PUBLIC_BUILT_FROM_PUSH', // was built by 'image-on-push'?

    'NEXT_PUBLIC_DEV_HINT', // for debugging, since we can't override NODE_ENV
    'NEXT_PUBLIC_ENABLED_FEATURES' // for debugging, used to set/override enabled feautures while developing
] as const;

type Environment = { [key in typeof envNames[number]]: string };

const env = {} as Environment;
for (const k of envNames)
    env[k] = process.env[k] || '';

export default env;


//
// Helpers
const isDev = (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') || process.env.NEXT_PUBLIC_DEV_HINT;
export const IsProd = !isDev;
export const IsDev = isDev;
export const IsCI = env.NEXT_PUBLIC_BUILT_FROM_PUSH && env.NEXT_PUBLIC_BUILT_FROM_PUSH != 'false';

const appFeatureNames = [
    'SINGLE_SIGN_ON',
    'REASSIGN_PARTITIONS'
] as const;
export type AppFeature = typeof appFeatureNames[number];

if (env.NEXT_PUBLIC_ENABLED_FEATURES)
    (window as any)['ENABLED_FEATURES'] = env.NEXT_PUBLIC_ENABLED_FEATURES;
const featuresRaw = (window as any)['ENABLED_FEATURES'] ?? '';
const enabledFeatures = featuresRaw.split(',') as AppFeature[];

const features = {} as { [key in AppFeature]: boolean };
for (const f of appFeatureNames)
    features[f] = enabledFeatures.includes(f);

export const AppFeatures = features;

const basePathRaw: string = (window as any)['BASE_URL'];
const basePath = (typeof basePathRaw === 'string' && !basePathRaw.startsWith('__BASE_PATH'))
    ? basePathRaw
    : '';
const basePathTrimmed = basePath
    ? basePath.removePrefix('/').removeSuffix('/')
    : '';

const basePathS = basePathTrimmed
    ? '/' + basePathTrimmed
    : '';

export function getBasePath() {
    return basePathS;
}


export function getBuildDate(): Date | undefined {
    const timestamp = +env.NEXT_PUBLIC_BUILD_TIMESTAMP;
    if (timestamp == 0) return undefined;
    return new Date(timestamp * 1000);
}

//
// Print all env vars to console
const envVarDebugObj = {} as any;
const envVarDebugAr: { name: string, value: string }[] = [];

const addProp = (key: string, value: any) => {
    if (value === undefined || value === null || value === '') return;
    key = key.removePrefix('NEXT_PUBLIC_CONSOLE_').removePrefix('NEXT_PUBLIC_');
    envVarDebugObj[key] = value;
    envVarDebugAr.push({ name: key, value: value });
}
// - add env vars
for (const k in env) addProp(k, (env as any)[k]);

// - print
console.log(toJson(envVarDebugObj));

export { envVarDebugObj, envVarDebugAr };
