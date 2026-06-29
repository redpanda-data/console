/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  type AnimatePresenceProps,
  AnimatePresence as AnimatePresenceRaw,
  motion,
  type Transition,
} from 'motion/react';
import React, { type CSSProperties, type FC } from 'react';

import { alwaysChanging } from './utils';

export const AnimatePresence = AnimatePresenceRaw as React.FunctionComponent<
  React.PropsWithChildren<AnimatePresenceProps>
>;

export type PositionProp =
  | 'static'
  | 'absolute'
  | 'initial'
  | 'inherit'
  | '-moz-initial'
  | 'revert'
  | 'unset'
  | '-webkit-sticky'
  | 'fixed'
  | 'relative'
  | 'sticky'
  | undefined;

const time = 0.25; // 0.15
const dist = 2;
const dx100em = [`${dist * -1}em`, 0, `${dist}em`];
const dx50em = [`${dist * 0.5 * -1}em`, 0, `${dist * 0.5}em`];
// ease:
// "linear" | "easeIn" | "easeOut" | "easeInOut" | "circIn" | "circOut" | "circInOut" | "backIn" | "backOut" | "backInOut" | "anticipate"

const transition: Transition = {
  ease: 'easeInOut', //staggerChildren: 0,
  duration: time,
};

// Page switch
export const animProps = {
  transition,
  initial: { opacity: 0, position: 'static' as PositionProp },
  animate: { opacity: 1, position: 'static' as PositionProp },
  exit: { opacity: 0, position: 'absolute' as PositionProp, width: 'auto' },
};

export const animProps_span_searchResult = {
  transition: { ease: 'circOut', duration: 0.2 },
  initial: { opacity: 0, x: dx100em[0] },
  animate: { opacity: 1, x: dx100em[1] },
  exit: { opacity: 0, x: dx50em[2] },
};

export const animProps_radioOptionGroup = {
  transition,
  initial: { opacity: 0, y: '-1em', height: 0, marginTop: 0 },
  animate: { opacity: 1, y: '0em', height: 'auto' },
  exit: { opacity: 0, y: '0em', height: 0, marginTop: 0 },
};

export const animProps_modalPage = {
  transition: { ease: 'easeOut', duration: 0.3 },
  initial: { opacity: 0, x: '1em', height: 'auto' }, // , position: 'relative' as PositionProp
  animate: { opacity: 1, x: '0em', height: 'auto' },
  exit: { opacity: 0, x: '-1em', height: 'auto' },
};

const logoRotation = 60;
export const animProps_logo = {
  transition: {
    transition: 'circOut',
    duration: 0.15,
  },
  initial: {
    opacity: 0,
    transform: `perspective(1000px) rotateX(-${logoRotation}deg)`,
    position: 'static' as PositionProp,
  },
  animate: {
    opacity: 1,
    transform: 'perspective(1000px) rotateX(0deg)',
    position: 'static' as PositionProp,
  },
  exit: {
    opacity: 0,
    transform: `perspective(1000px) rotateX(${logoRotation}deg)`,
    position: 'absolute' as PositionProp,
    width: 'auto',
  },
};

export const MotionAlways: FC = (p: { children?: React.ReactNode; style?: CSSProperties }) => (
  <motion.div key={alwaysChanging()} {...animProps} style={p.style}>
    {p.children}
  </motion.div>
);

export const MotionDiv: FC<{
  identityKey?: React.Key;
  children?: React.ReactNode;
  positionTransition?: boolean;
  layoutTransition?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: framer-motion props are complex and vary by component
  animProps?: any;
  style?: CSSProperties;
  className?: string;
}> = (p) => (
  <motion.div
    className={p.className}
    key={p.identityKey}
    layout={p.positionTransition}
    layoutTransition={p.layoutTransition}
    style={p.style}
    {...(p.animProps ?? animProps)}
  >
    {p.children}
  </motion.div>
);

export const MotionSpan: FC<{
  identityKey?: React.Key;
  children?: React.ReactNode;
  // biome-ignore lint/suspicious/noExplicitAny: framer-motion props are complex and vary by component
  overrideAnimProps?: any;
  style?: CSSProperties;
}> = (p) => (
  <motion.span key={p.identityKey} style={p.style} {...(p.overrideAnimProps ?? animProps)}>
    {p.children}
  </motion.span>
);
