import React, { FC, CSSProperties } from "react";
import { Transition, motion, useInvertedScale } from "framer-motion";
import { alwaysChanging } from "./utils";

export type PositionProp = "static" | "absolute" | "initial" | "inherit" | "-moz-initial" | "revert" | "unset" | "-webkit-sticky" | "fixed" | "relative" | "sticky" | undefined;

const time = 0.25; // 0.15
const dist = 2;
const dx100em = [(dist * -1) + 'em', 0, dist + 'em'];
const dx50em = [(dist * 0.5 * -1) + 'em', 0, (dist * 0.5) + 'em'];
// ease:
// "linear" | "easeIn" | "easeOut" | "easeInOut" | "circIn" | "circOut" | "circInOut" | "backIn" | "backOut" | "backInOut" | "anticipate"

const transition: Transition = {
    ease: 'circOut', //staggerChildren: 0,
    duration: time,
};


export const animProps = {
    transition: transition,
    initial: { opacity: 0, x: dx100em[0], position: 'static' },
    animate: { opacity: 1, x: dx100em[1], position: 'static' },
    exit: { opacity: 0, x: dx100em[2], position: 'absolute', width: 'auto' },
};

export const animProps_span_searchResult = {
    transition: { ease: 'circOut', duration: 0.2 },
    initial: { opacity: 0, x: dx100em[0] },
    animate: { opacity: 1, x: dx100em[1] },
    exit: { opacity: 0, x: dx50em[2] },
};

export const animProps_span_messagesStatus = {
    initial: {
        opacity: 0,
        x: 0,
        display: 'inline-block'
    },
    animate: {
        opacity: 1,
        x: dx100em[1],
        transition: {
            ease: 'easeOut',
            duration: 0,
            delay: 0
        },
    },
    exit: {
        opacity: 0,
        x: dx100em[2],
        transition: {
            ease: 'easeOut',
            duration: 0.35,
            delay: 0.9
        }
    },
};


export const MotionAlways: FC = (p: { children?: React.ReactNode, style?: CSSProperties }) =>
    <motion.div key={alwaysChanging()} {...animProps} style={p.style}>
        {p.children}
    </motion.div>;

export const MotionDiv: FC<{ identityKey?: any, positionTransition?: boolean, layoutTransition?: boolean, style?: CSSProperties }> = (p) =>
    <motion.div key={p.identityKey} positionTransition={p.positionTransition} layoutTransition={p.layoutTransition} style={p.style} {...animProps} >
        {p.children}
    </motion.div>;

export const MotionSpan: FC<{ identityKey?: any, overrideAnimProps?: any, style?: CSSProperties }> = (p) =>
    <motion.span key={p.identityKey} style={p.style} {...(p.overrideAnimProps ?? animProps)}>
        {p.children}
    </motion.span>;

export const MotionDivInvertedScale: FC<{ children?: React.ReactNode, style?: CSSProperties }> = p => {
    const { scaleX, scaleY } = useInvertedScale();
    return <motion.div style={{ scaleX, scaleY, ...p.style }}>
        {p.children}
    </motion.div>
}