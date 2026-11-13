'use client';

// Copyright 2026 Redpanda Data, Inc.

import { UploadIcon } from 'lucide-react';
import React, { useContext } from 'react';
import * as FileInput from '@ui-sdk/react/file-input';

import { buttonVariants, type ButtonVariants } from './button';
import { cn, type SharedProps } from '../lib/utils';

interface DropzoneContextType {
  accept?: Record<string, string[]>;
  maxFiles?: number;
  maxSize?: number;
  minSize?: number;
  src?: File[];
}

const renderBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(2)}${units[unitIndex]}`;
};

const DropzoneContext = React.createContext<DropzoneContextType | undefined>(undefined);

type FileInputProps = React.ComponentProps<typeof FileInput.FileInput>;
export type DropzoneProps = Pick<FileInputProps, 'disabled' | 'multiple' | 'minSize' | 'maxSize' | 'maxFiles'> &
  SharedProps & {
    accept?: Record<string, string[]>;
    src?: File[];
    className?: string;
    onDrop?: (files: File[]) => void;
    onError?: (error: Error) => void;
    children?: React.ReactNode;
    variant?: ButtonVariants['variant'];
  };
const rejectionMessages: Record<string, string> = {
  'file-type': 'File type not accepted',
  'file-too-large': 'File is too large',
  'file-too-small': 'File is too small',
  'too-many-files': 'Too many files',
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
  multiple = maxFiles !== 1,
}: DropzoneProps & { ref?: React.Ref<HTMLButtonElement> }) => (
  <DropzoneContext.Provider value={{ src, accept, maxSize, minSize, maxFiles }}>
    <FileInput.FileInput
      accept={accept ? Object.entries(accept).flatMap(([mime, extensions]) => [mime, ...extensions]) : undefined}
      maxFiles={maxFiles}
      maxSize={maxSize}
      minSize={minSize}
      disabled={disabled}
      multiple={multiple}
      onValueChange={(files, details) => {
        // Certificates and licenses are atomic uploads: never process a partially rejected drop.
        if (details.rejected.length) details.cancel();
        else onDrop?.(files);
      }}
      onReject={(rejected) => {
        const reason = rejected[0]?.reasons[0];
        if (reason) onError?.(new Error(rejectionMessages[reason] ?? reason));
      }}
    >
      <FileInput.FileInputDropzone className="group w-full data-dragging:ring-2 data-dragging:ring-ring data-drag-reject:ring-destructive">
        <FileInput.FileInputTrigger
          ref={ref}
          data-testid={testId}
          className={cn(buttonVariants({ variant }), 'relative h-auto w-full flex-col overflow-hidden p-8', className)}
        >
          {children}
        </FileInput.FileInputTrigger>
      </FileInput.FileInputDropzone>
    </FileInput.FileInput>
  </DropzoneContext.Provider>
);

Dropzone.displayName = 'Dropzone';

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext);

  if (!context) {
    throw new Error('useDropzoneContext must be used within a Dropzone');
  }

  return context;
};

export interface DropzoneContentProps {
  children?: React.ReactNode;
  className?: string;
}

const maxLabelItems = 3;

export const DropzoneContent = ({ children, className }: DropzoneContentProps) => {
  const { src } = useDropzoneContext();

  if (!src) {
    return null;
  }

  if (children) {
    return children;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <UploadIcon size={16} />
      </div>
      <p className="my-2 w-full truncate text-label">
        {src.length > maxLabelItems
          ? `${src
              .slice(0, maxLabelItems)
              .map((file) => file.name)
              .join(', ')} and ${src.length - maxLabelItems} more`
          : src.map((file) => file.name).join(', ')}
      </p>
      <p className="w-full text-wrap text-body-sm text-subtle">Drag and drop or click to replace</p>
    </div>
  );
};

export interface DropzoneEmptyStateProps {
  children?: React.ReactNode;
  className?: string;
}

export const DropzoneEmptyState = ({ children, className }: DropzoneEmptyStateProps) => {
  const { src, accept, maxSize, minSize, maxFiles } = useDropzoneContext();

  if (src) {
    return null;
  }

  if (children) {
    return <div className={cn('flex flex-col items-center justify-center', className)}>{children}</div>;
  }

  let caption = '';

  if (accept) {
    caption += 'Accepts ';
    const accepted = Object.values(accept).flat();
    caption += accepted.join(', ');
  }

  if (minSize && maxSize) {
    caption += ` between ${renderBytes(minSize)} and ${renderBytes(maxSize)}`;
  } else if (minSize) {
    caption += ` at least ${renderBytes(minSize)}`;
  } else if (maxSize) {
    caption += ` less than ${renderBytes(maxSize)}`;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className="flex size-8 items-center justify-center rounded-md bg-surface-subtle text-subtle transition-colors group-hover:bg-accent group-hover:text-accent-foreground motion-reduce:transition-none">
        <UploadIcon size={16} />
      </div>
      <p className="my-2 w-full truncate text-wrap text-label">Upload {maxFiles === 1 ? 'a file' : 'files'}</p>
      <p className="w-full truncate text-wrap text-body-sm text-subtle">Drag and drop or click to upload</p>
      {caption ? <p className="text-wrap text-body-sm text-subtle">{caption}.</p> : null}
    </div>
  );
};
