import React, { ReactNode, Component, CSSProperties } from "react";
import { numberToThousandsString } from "../../utils/tsxUtils";

export function ShortNum(p: { value: number, tooltip?: boolean, className?: string, style?: CSSProperties }) {
    let { value, tooltip, className, style } = p;
    if (tooltip == null) tooltip = false;
    const originalValue = value;

    const million = 1000 * 1000;


    let decimals: number;
    let unit = "";
    if (value >= million) {
        // 1000000
        unit = "M";
        value /= million;
        decimals = 2;
    }
    else if (value >= 1000) {
        // 1000
        unit = "k";
        value /= 1000;
        decimals = 1;
    }
    else {
        // 0-999
        decimals = 1;
    }

    // If, after down-scaling the number, it is still >=1k we need to add thousands separators
    // const needsThoudandsSeparators = value >= 1000;


    // Convert to fixed decimal string for rounding,
    // then drop trailing zeroes by converting to number and back to string
    const valString = Number(value.toFixed(decimals)).toLocaleString();
    const str = unit
        ? valString + unit
        : valString;

    if (tooltip) {
        if (!className) className = 'tooltip';
        else className += " tooltip";

        return <div className={className} style={style}>
            {str}
            <span className="tooltiptext">{numberToThousandsString(originalValue)}</span>
        </div>
    }
    else {
        return <span className={className} style={style}>
            {str}
        </span>
    }
}

