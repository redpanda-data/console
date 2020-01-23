

const envNames = [
    'REACT_APP_GIT_SHA',
    'REACT_APP_GIT_REF', // 'master' or 'v1.2.3'
    'REACT_APP_TIMESTAMP'
] as const;

type Environment = { [key in typeof envNames[number]]: string };

const env = {} as Environment;

for (let k of envNames)
    env[k] = process.env[k] || '';

export default env;

export function getBuildDate(): string {
    const timestamp = +env.REACT_APP_TIMESTAMP
    if (timestamp == 0) {
        return '??';
    }

    return new Date(timestamp * 1000).toLocaleDateString()
}