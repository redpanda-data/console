
export { }

declare global {
    interface Number {
        /**
         * linear interpolation to another number
         * @param to number to interpolate to
         * @param t factor between 0 and 1
         */
        lerp(this: number, to: number, t: number): number;

        clamp(this: number, min: number | undefined, max: number | undefined): number;
    }
}

Number.prototype.lerp = function (this: number, to: number, t: number): number {
    const d = to - this;
    return this + d * t;
};

Number.prototype.clamp = function (this: number, min: number | undefined, max: number | undefined): number {
    if (max !== undefined)
        if (this > max) return max;
    if (min !== undefined)
        if (this < min) return min;
    return this;
};
