'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import { UploadIcon } from 'lucide-react';
import React, { useContext } from 'react';
import type { DropEvent, DropzoneOptions, FileRejection } from 'react-dropzone';
import { useDropzone } from 'react-dropzone';
import type { ButtonVariants } from './button';
import { buttonVariants } from './button/variants';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';
import { requireDefined } from '../lib/utils/require-defined';
import { requireInstance } from '../lib/utils/require-instance';
import { rejectedFilesError } from './dropzone/errors';

interface DropzoneContextType {
  accept?: DropzoneOptions['accept'] | undefined;
  maxFiles?: DropzoneOptions['maxFiles'] | undefined;
  maxSize?: DropzoneOptions['maxSize'] | undefined;
  minSize?: DropzoneOptions['minSize'] | undefined;
  src?: File[] | undefined;
}

const renderBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(2)}${requireDefined(units[unitIndex], 'Expected a file-size unit')}`;
};

const DropzoneContext = React.createContext<DropzoneContextType | undefined>(undefined);

const dropzoneVariants = cva('group relative h-auto w-full flex-col overflow-hidden', {
  variants: { appearance: { default: 'p-8', avatar: 'aspect-square rounded-full p-0' } },
  defaultVariants: { appearance: 'default' },
});

export type DropzoneProps = Omit<DropzoneOptions, 'onDrop'> &
  SharedProps & {
    appearance?: 'default' | 'avatar' | undefined;
    src?: File[] | undefined;
    className?: string | undefined;
    onDrop?: ((acceptedFiles: File[], fileRejections: FileRejection[], event: DropEvent) => void) | undefined;
    children?: React.ReactNode | undefined;
    variant?: ButtonVariants['variant'] | undefined;
  };

export const Dropzone = ({
  accept,
  maxFiles = 1,
  maxSize,
  minSize,
  onDrop,
  onError,
  disabled,
  src,
  className,
  children,
  testId,
  variant = 'outline',
  ref,
  appearance = 'default',
  ...props
}: DropzoneProps & { ref?: React.Ref<HTMLButtonElement> | undefined }) => {
  const [failure, setFailure] = React.useState<Error>();
  const errorId = React.useId();
  const reportFailure = (error: Error) => {
    setFailure(error);
    onError?.(error);
  };
  const { getRootProps, getInputProps, isDragActive, isDragReject, rootRef } = useDropzone(
    omitUndefined({
      accept,
      maxFiles,
      maxSize,
      minSize,
      onError: reportFailure,
      disabled,
      onDrop: (acceptedFiles: File[], fileRejections: FileRejection[], event: DropEvent) => {
        if (fileRejections.length > 0) {
          reportFailure(rejectedFilesError(fileRejections));
          return;
        }
        setFailure(undefined);
        try {
          onDrop?.(acceptedFiles, fileRejections, event);
        } catch (error) {
          reportFailure(
            error instanceof Error ? error : new Error('Could not apply the selected files.', { cause: error })
          );
        }
      },
      ...props,
    })
  );
  // The native picker is activated by the action, not a second exposed control inside it.
  // Override the vendor's inline display recipe so the HTML hidden state remains effective.
  const inputProps = getInputProps({ hidden: true, style: undefined });
  React.useImperativeHandle(ref, () =>
    requireInstance(rootRef.current, HTMLButtonElement, 'Dropzone requires its native upload action')
  );

  return (
    <DropzoneContext.Provider value={{ src, accept, maxSize, minSize, maxFiles }}>
      <div
        className={cn('flex min-w-0 flex-col gap-2', appearance === 'avatar' ? 'w-32' : 'w-full', className)}
        data-slot="dropzone"
      >
        <ButtonPrimitive
          aria-describedby={failure === undefined ? undefined : errorId}
          aria-invalid={failure !== undefined || undefined}
          className={cn(
            variant !== 'unstyled' && 'rounded-md',
            variant !== 'unstyled' && buttonVariants({ variant }),
            dropzoneVariants({ appearance }),
            isDragActive && 'ring-2 ring-ring outline-none',
            isDragReject && 'ring-destructive'
          )}
          data-testid={testId}
          disabled={disabled}
          type="button"
          {...getRootProps({ role: 'button' })}
        >
          {children}
        </ButtonPrimitive>
        <input {...inputProps} disabled={disabled} />
        {failure === undefined ? null : (
          <p
            className="text-body-sm [overflow-wrap:anywhere] whitespace-pre-line text-destructive"
            id={errorId}
            role="alert"
          >
            {failure.message.trim().length === 0 ? 'Could not select files. Try again.' : failure.message}
          </p>
        )}
      </div>
    </DropzoneContext.Provider>
  );
};

Dropzone.displayName = 'Dropzone';

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext);

  if (context === undefined) {
    throw new Error('useDropzoneContext must be used within a Dropzone');
  }

  return context;
};

export interface DropzoneContentProps {
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}

const maxLabelItems = 3;

export const DropzoneContent = ({ children, className }: DropzoneContentProps) => {
  const { src } = useDropzoneContext();

  if (src === undefined || src.length === 0) {
    return null;
  }

  if (hasSlotContent(children)) {
    return children;
  }

  return (
    <span className={cn('flex flex-col items-center justify-center', className)}>
      <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <UploadIcon size={16} />
      </span>
      <span className="my-2 w-full truncate text-label">
        {src.length > maxLabelItems
          ? `${src
              .slice(0, maxLabelItems)
              .map((file) => file.name)
              .join(', ')} and ${src.length - maxLabelItems} more`
          : src.map((file) => file.name).join(', ')}
      </span>
      <span className="w-full text-body-sm text-wrap text-subtle">Drag and drop or click to replace</span>
    </span>
  );
};

export interface DropzoneEmptyStateProps {
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}

function dropzoneCaption({ accept, minSize, maxSize }: DropzoneContextType): string {
  let caption = '';
  if (accept !== undefined) {
    // Named filters expose their descriptions; unnamed filters expose their MIME types.
    const accepted = Array.isArray(accept)
      ? accept.map((group) => group.description ?? Object.keys(group.accept).join(', '))
      : Object.keys(accept);
    caption = `Accepts ${accepted.join(', ')}`;
  }
  if (minSize !== undefined && minSize !== 0 && maxSize !== undefined && maxSize !== 0) {
    return `${caption} between ${renderBytes(minSize)} and ${renderBytes(maxSize)}`;
  }
  if (minSize !== undefined && minSize !== 0) {
    return `${caption} at least ${renderBytes(minSize)}`;
  }
  return maxSize !== undefined && maxSize !== 0 ? `${caption} less than ${renderBytes(maxSize)}` : caption;
}

export const DropzoneEmptyState = ({ children, className }: DropzoneEmptyStateProps) => {
  const { src, accept, maxSize, minSize, maxFiles } = useDropzoneContext();

  if (src !== undefined && src.length > 0) {
    return null;
  }

  if (hasSlotContent(children)) {
    return <span className={cn('flex flex-col items-center justify-center', className)}>{children}</span>;
  }

  const caption = dropzoneCaption({ accept, minSize, maxSize });

  return (
    <span className={cn('flex flex-col items-center justify-center', className)}>
      <span className="flex size-8 items-center justify-center rounded-md bg-surface-subtle text-subtle transition-colors group-hover:bg-accent group-hover:text-accent-foreground motion-reduce:transition-none">
        <UploadIcon size={16} />
      </span>
      <span className="my-2 w-full truncate text-label text-wrap">Upload {maxFiles === 1 ? 'a file' : 'files'}</span>
      <span className="w-full truncate text-body-sm text-wrap text-subtle">Drag and drop or click to upload</span>
      {caption === '' ? null : <span className="text-body-sm text-wrap text-subtle">{caption}.</span>}
    </span>
  );
};
