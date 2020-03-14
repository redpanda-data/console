import React, { Children } from "react";



const thousandsSeperator = (1234).toLocaleString()[1];

export function numberToThousandsString(n: number): JSX.Element {
    const parts = n.toLocaleString().split(thousandsSeperator);

    const result: JSX.Element[] = [];
    for (let i = 0; i < parts.length; i++) {
        const last = i == parts.length - 1;

        // Add the number block itself; React.Fragment is used explicitly to avoid missing key warning
        result.push(<React.Fragment key={i}>{parts[i]}</React.Fragment>);

        // Add a dot
        if (!last)
            result.push(<span key={i + '.'} className='noSelect'>{thousandsSeperator}</span>);
    }

    return <>{result}</>
}

export const ZeroSizeWrapper = (p: { width: number, height: number, children?: React.ReactNode }) => {
    return <span style={{
        width: p.width, height: p.height,
        display: 'inline-flex', placeContent: 'center', placeItems: 'center',

    }}>
        {p.children}
    </span>;
};


export const copyIcon = <svg viewBox="0 0 14 16" version="1.1" width="14" height="16" aria-hidden="true">
    <path fill-rule="evenodd" d="M2 13h4v1H2v-1zm5-6H2v1h5V7zm2 3V8l-3 3 3 3v-2h5v-2H9zM4.5 9H2v1h2.5V9zM2 12h2.5v-1H2v1zm9 1h1v2c-.02.28-.11.52-.3.7-.19.18-.42.28-.7.3H1c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h3c0-1.11.89-2 2-2 1.11 0 2 .89 2 2h3c.55 0 1 .45 1 1v5h-1V6H1v9h10v-2zM2 5h8c0-.55-.45-1-1-1H8c-.55 0-1-.45-1-1s-.45-1-1-1-1 .45-1 1-.45 1-1 1H3c-.55 0-1 .45-1 1z"></path></svg>
