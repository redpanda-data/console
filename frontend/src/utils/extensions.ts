
export { }

declare global {
    interface String {
        removePrefix(this: string, prefix: string): string;
        removeSuffix(this: string, suffix: string): string;
    }
}


String.prototype.removePrefix = function (this: string, prefix: string) {
    if (this.toLowerCase().startsWith(prefix.toLowerCase()))
        return this.substr(prefix.length);
    return this;
}

String.prototype.removeSuffix = function (this: string, suffix: string) {
    if (this.toLowerCase().endsWith(suffix.toLowerCase()))
        return this.substr(0, this.length - suffix.length);
    return this;
}

