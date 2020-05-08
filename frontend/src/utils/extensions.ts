
export { }

declare global {
    interface String {
        removePrefix(this: string, prefix: string): string;
    }
}


String.prototype.removePrefix = function (this: string, prefix: string) {
    if (this.toLowerCase().startsWith(prefix.toLowerCase()))
        return this.substr(prefix.length);
    return this;
}

