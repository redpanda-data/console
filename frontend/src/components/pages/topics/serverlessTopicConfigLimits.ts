import { isServerless } from '../../../config';


// Returns an error message for given config values.
// If the config is valid, it returns undefined
export function isConfigEntryInValidRange(configName: string, value: string | number): string | undefined {
    // Since this function is only temporary, we only check in serverless
    // Later these checks should be done on the backend and error messages forwarded to the frontend
    if (!isServerless())
        return undefined;

    switch (configName) {
        case 'retention.ms':
            const millisecondsPerDay = 1000 * 60 * 60 * 24;

            const isValid = Number(value) >= millisecondsPerDay
                && Number(value) <= (7 * millisecondsPerDay);

            if (isValid)
                return undefined;
            else
                return 'Retention time must be between 1 and 7 days';


        case 'retention.bytes':
            const oneGB = 1024 * 1024 * 1024;

            if (Number(value) > (50 * oneGB))
                return 'Maximum retention size is 50GB';
            return undefined;

        default:
            return undefined;
    }
}
