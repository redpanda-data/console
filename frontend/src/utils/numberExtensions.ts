
export { }

declare global {
    interface Number {
        /**
         * linear interpolation to another number
         * @param to number to interpolate to
         * @param t factor between 0 and 1
         */
        lerp(this: number, to: number, t: number): number;
    }
}

Number.prototype.lerp = function (this: number, to: number, t: number): number {
    const d = to - this;
    return this + d * t;
};
