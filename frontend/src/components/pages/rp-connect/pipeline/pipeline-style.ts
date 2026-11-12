import type { CSSProperties } from 'react';

/** Dynamic geometry and accents consumed by pipeline-editor.css. */
export type PipelineStyle = CSSProperties & { [key: `--pipeline-${string}`]: string | number | undefined };
