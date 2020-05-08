import { ToJson, Clone } from "./utils";
import './extensions';

// const assertions and mapped types are awesome!
// type
// { [key: string]: string }

const envNames = [
    'REACT_APP_KOWL_GIT_SHA',
    'REACT_APP_KOWL_GIT_REF', // 'master' or 'v1.2.3'
    'REACT_APP_KOWL_TIMESTAMP',

    'REACT_APP_KOWL_BUSINESS_GIT_SHA',
    'REACT_APP_KOWL_BUSINESS_GIT_REF',
    'REACT_APP_KOWL_BUSINESS_TIMESTAMP',

    'REACT_APP_BUILT_FROM_PUSH', // was built by 'image-on-push'?
    'REACT_APP_BUSINESS', // is business version?
] as const;

type Environment = { [key in typeof envNames[number]]: string };

const env = {} as Environment;
for (let k of envNames)
    env[k] = process.env[k] || '';

export default env;


//
// Helpers
const isDev = (!process.env.NODE_ENV || process.env.NODE_ENV === 'development');
export const IsProduction = !isDev; // todo: rename IsProd IsDev
export const IsDevelopment = isDev;

export const IsBusiness = Boolean(env.REACT_APP_BUSINESS);
export const AppName = IsBusiness ? 'Kowl Business' : 'Kowl';

export function getBuildDate(version: 'free' | 'business'): Date | undefined {
    const timestamp = version == 'free' ? +env.REACT_APP_KOWL_TIMESTAMP : +env.REACT_APP_KOWL_BUSINESS_TIMESTAMP;
    if (timestamp == 0) return undefined;
    return new Date(timestamp * 1000);
}


//
// Print all env vars to console
export const envVarDebugObj = {} as any;
export const envVarDebugAr: { name: string, value: string }[] = [];
{
    const addProp = (key: string, value: any) => {
        if (value === undefined || value === null || value === "") return;
        key = key.removePrefix("REACT_APP_KOWL_").removePrefix("REACT_APP_");
        envVarDebugObj[key] = value;
        envVarDebugAr.push({ name: key, value: value });
    }
    // - add env vars
    for (const k in envVarDebugObj) addProp(k, (env as any)[k]);

    // - add custom
    addProp('NODE_ENV', process.env.NODE_ENV);
    addProp("appName", AppName);

    // - print
    console.log(ToJson(envVarDebugObj));
}
