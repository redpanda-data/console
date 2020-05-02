import { ToJson } from "./utils";
import { isBusinessVersion } from "..";
import { IsDevelopment } from "./isProd";


const envNames = [
    'REACT_APP_KOWL_GIT_SHA',
    'REACT_APP_KOWL_GIT_REF', // 'master' or 'v1.2.3'
    'REACT_APP_KOWL_TIMESTAMP',
    'REACT_APP_KOWL_BUSINESS_GIT_SHA',
    'REACT_APP_KOWL_BUSINESS_GIT_REF',
    'REACT_APP_KOWL_BUSINESS_TIMESTAMP',

] as const;

type Environment = { [key in typeof envNames[number]]: string };

const env = {} as Environment;

for (let k of envNames)
    env[k] = process.env[k] || '';

const versionObject = JSON.parse(ToJson(env));
versionObject['REACT_APP_BUSINESS'] = process.env.REACT_APP_BUSINESS ?? false;
versionObject['NODE_ENV'] = process.env.NODE_ENV;
console.log(ToJson(versionObject));

export default env;

export function getBuildDate(): string {
    let timestamp = +env.REACT_APP_KOWL_TIMESTAMP
    if (timestamp == 0) {
        return '??';
    }

    const timestampBusiness = +env.REACT_APP_KOWL_BUSINESS_TIMESTAMP
    if (timestampBusiness && timestampBusiness > timestamp) {
        timestamp = timestampBusiness;
    }

    return new Date(timestamp * 1000).toLocaleDateString()
}
