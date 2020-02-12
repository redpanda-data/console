import React, { FC, CSSProperties } from "react";
import { Transition, motion } from "framer-motion";
import { alwaysChanging } from "./utils";
import { PositionProperty } from "csstype";

const time = 0.2; // 0.15
const dist = 1;
const dx = [(dist * -1) + 'em', 0, dist + 'em'];

const transition: Transition = {
    ease: 'easeOut',
    duration: time,
    staggerChildren: 0
};


export const animProps = {
    transition: transition,
    initial: { opacity: 0, x: dx[0], position: 'static' as PositionProperty },
    animate: { opacity: 1, x: dx[1], position: 'static' as PositionProperty },
    exit: { opacity: 0, x: dx[2], position: 'absolute' as PositionProperty, width: 'auto' },
};

export const MotionAlways: FC = (p: { children?: React.ReactNode, style?: CSSProperties }) => <motion.div {...animProps} {...p} key={alwaysChanging()} />;
export const MotionDiv: FC<{ identityKey?: any, positionTransition?: boolean, layoutTransition?: boolean, style?: CSSProperties }> = (p) =>
    <motion.div {...animProps} positionTransition={p.positionTransition} layoutTransition={p.layoutTransition} key={p.identityKey} style={p.style}>{p.children}</motion.div>;
export const MotionSpan: FC<{ identityKey?: any }> = (p) => <motion.span {...animProps} key={p.identityKey}>{p.children}</motion.span>;
