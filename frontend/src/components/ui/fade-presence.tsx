/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Subtle mount/unmount transition for conditional UI chrome — toolbar chips,
 * status lines, inline hints. Enter rises gently on the house ease-out curve;
 * exit is quicker so disappearing elements never lag the interaction that
 * dismissed them. `initial={false}` keeps the first page render static (only
 * changes animate), and reduced-motion preferences collapse it to a pure fade.
 */
export function FadePresence({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const hidden = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 2, scale: 0.98 };

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={className}
          exit={{ ...hidden, transition: { duration: 0.12, ease: 'easeIn' } }}
          initial={hidden}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
