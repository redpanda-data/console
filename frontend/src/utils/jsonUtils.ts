const seen = new Set();
// Serialize object to json, handling reference loops gracefully
export function toJson(obj: any, space?: string | number | undefined): string {
    seen.clear();
    try {
        return JSON.stringify(obj,
            (key: string, value: any) => {
                if (typeof value === "object" && value !== null) {
                    if (seen.has(value)) {
                        return;
                    }
                    seen.add(value);
                }
                return value;
            },
            space
        );
    }
    finally {
        seen.clear();
    }
}
// Clone object using serialization

export function clone<T>(obj: T): T {
    if (!obj)
        return obj;
    return JSON.parse(toJson(obj));
}
// Accesses all members of an object by serializing it


export function touch(obj: any): void {
    JSON.stringify(obj, (k, v) => {
        if (typeof v === 'object')
            return v;
        return '';
    });
}
