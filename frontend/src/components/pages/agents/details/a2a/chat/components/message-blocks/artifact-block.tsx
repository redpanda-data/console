/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from 'components/ai-elements/artifact';
import { Image } from 'components/ai-elements/image';
import { Response } from 'components/ai-elements/response';

import type { ArtifactPart } from '../../types';

type ArtifactBlockProps = {
  artifactId: string;
  name?: string;
  description?: string;
  parts: ArtifactPart[];
  timestamp: Date;
};

/**
 * Renders an artifact block (Jupyter-style cell)
 * Displays generated content, code, or data from the agent
 * Supports text and file (e.g., image) parts
 */
export const ArtifactBlock = ({ artifactId, name, description, parts, timestamp }: ArtifactBlockProps) => {
  const time = timestamp.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  return (
    <Artifact className="mt-4" key={artifactId}>
      <ArtifactHeader>
        <div>
          <ArtifactTitle>{name || 'Artifact'}</ArtifactTitle>
          {Boolean(description) && <ArtifactDescription>{description}</ArtifactDescription>}
        </div>
      </ArtifactHeader>
      <ArtifactContent>
        {parts.map((part, index) => {
          if (part.kind === 'text') {
            return <Response key={index}>{part.text}</Response>;
          }

          if (part.kind === 'file' && part.file.mimeType.startsWith('image/')) {
            const imageSrc = part.file.bytes
              ? `data:${part.file.mimeType};base64,${part.file.bytes}`
              : part.file.uri || '';

            return (
              <div className="my-4 flex justify-center" key={index}>
                {part.file.bytes ? (
                  <Image
                    alt={part.file.name || 'Generated image'}
                    base64={part.file.bytes}
                    className="h-auto max-w-full rounded-md"
                    mediaType={part.file.mimeType}
                    uint8Array={new Uint8Array()}
                  />
                ) : (
                  <img
                    alt={part.file.name || 'Generated image'}
                    className="h-auto max-w-full rounded-md"
                    src={imageSrc}
                  />
                )}
              </div>
            );
          }

          return null;
        })}
      </ArtifactContent>
      <div className="border-t bg-muted/30 px-4 py-2 text-muted-foreground text-xs">
        <div className="flex flex-col gap-0.5">
          <div className="flex gap-1.5">
            <span className="font-medium">artifact_id:</span>
            <span className="font-mono">{artifactId}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="font-medium">time:</span>
            <span>{time}</span>
          </div>
        </div>
      </div>
    </Artifact>
  );
};
