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

import { cn } from 'components/redpanda-ui/lib/utils';
import { ArrowRight, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

type TemplateGalleryCtaProps = {
  /** Whether the entry point should be visible (animates in/out on change). */
  show: boolean;
  onBrowseTemplates: () => void;
  /** Positioning for the floating wrapper. Defaults to a full-width bottom bar. */
  className?: string;
  /** An optional secondary line under the button (e.g. a ⌘K hint on the full editor). */
  hint?: ReactNode;
};

/**
 * "Start from a template" entry point, floated at the bottom of an empty visualizer with a
 * soft enter/exit animation. Used by both the sidebar lane and the full visual editor.
 */
export function TemplateGalleryCta({ show, onBrowseTemplates, className, hint }: TemplateGalleryCtaProps) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={cn('pointer-events-none absolute right-4 bottom-4 left-4 z-10', className)}
          exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } }}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ duration: 0.3, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <button
            aria-label="Start from a template"
            className="nodrag nopan group pointer-events-auto flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border border-dashed bg-card px-3 py-2.5 text-left shadow-sm transition-all hover:border-brand/50 hover:bg-muted/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            data-testid="browse-templates-cta"
            onClick={onBrowseTemplates}
            type="button"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
              <Sparkles className="size-3.5" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="font-medium text-foreground text-sm">Start from a template</span>
              <span className="text-muted-foreground text-xs">Skip the YAML — fill a short form</span>
            </div>
            <ArrowRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
            />
          </button>
          {hint ? (
            <p className="pointer-events-none mt-2 flex items-center justify-center gap-1.5 text-center text-muted-foreground text-xs">
              {hint}
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
