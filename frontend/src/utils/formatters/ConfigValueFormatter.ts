import { prettyBytesOrNA, prettyMilliseconds } from "../utils";

export function formatConfigValue(name: string, value: string | null | undefined, formatType: 'friendly' | 'raw' | 'both'): string {
    let suffix: string;

    if (value == null) return "";

    switch (formatType) {
        case 'friendly':
            suffix = '';
            break;
        case 'both':
            suffix = ' (' + value + ')';
            break;

        case 'raw':
        default:
            return value;
    }

    //
    // String
    //
    if (value && (name == "advertised.listeners" || name == "listener.security.protocol.map" || name == "listeners")) {
        const listeners = value.split(',');
        return listeners.join('\n');
    }


    //
    // Numeric
    //
    const num = Number(value);
    if (value == null || value == "" || value == "0" || Number.isNaN(num))
        return value;

    // Special cases
    if (name == 'flush.messages' && num > Math.pow(2, 60)) return 'Never' + suffix; // messages between each fsync

    if (name.endsWith('.bytes.per.second')) {
        if (num >= Number.MAX_SAFE_INTEGER) return 'Infinite' + suffix;
        return prettyBytesOrNA(num) + '/s' + suffix;
    }

    // Time
    const timeExtensions: [string, number][] = [
        // name ending -> conversion to milliseconds
        [".ms", 1],
        [".seconds", 1000],
        [".minutes", 60 * 1000],
        [".hours", 60 * 60 * 1000],
        [".days", 24 * 60 * 60 * 1000],
    ];
    for (const [ext, msFactor] of timeExtensions) {
        if (!name.endsWith(ext)) continue;
        if (num > Number.MAX_SAFE_INTEGER || num == -1) return "Infinite" + suffix;

        const ms = num * msFactor;
        return prettyMilliseconds(ms, { verbose: true }) + suffix;
    }

    // Bytes
    if (name.endsWith('.bytes') || name.endsWith('.buffer.size') || name.endsWith('.replication.throttled.rate') || name.endsWith('.reassignment.throttled.rate')) {
        if (num < 0 || num >= Number.MAX_VALUE) return 'Infinite' + suffix;
        return prettyBytesOrNA(num) + suffix;
    }

    // Ratio
    if (name.endsWith('.ratio')) {
        return (num * 100).toLocaleString() + '%';
    }

    return value;
}