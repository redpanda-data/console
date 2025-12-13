'use client';

import { UploadIcon } from 'lucide-react';
import React, { useContext } from 'react';
import type { DropEvent, DropzoneOptions, FileRejection } from 'react-dropzone';
import { useDropzone } from 'react-dropzone';

import { Button } from './button';
import { cn } from '../lib/utils';

type DropzoneContextType = {
  src?: File[];
  accept?: DropzoneOptions['accept'];
  maxSize?: DropzoneOptions['maxSize'];
  minSize?: DropzoneOptions['minSize'];
  maxFiles?: DropzoneOptions['maxFiles'];
};

const renderBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)}${units[unitIndex]}`;
};

const DropzoneContext = React.createContext<DropzoneContextType | undefined>(undefined);

export type DropzoneProps = Omit<DropzoneOptions, 'onDrop'> & {
  src?: File[];
  className?: string;
  onDrop?: (acceptedFiles: File[], fileRejections: FileRejection[], event: DropEvent) => void;
  children?: React.ReactNode;
  testId?: string;
};

export const Dropzone = React.forwardRef<HTMLButtonElement, DropzoneProps>(
  (
    { accept, maxFiles = 1, maxSize, minSize, onDrop, onError, disabled, src, className, children, testId, ...props },
    ref,
  ) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      accept,
      maxFiles,
      maxSize,
      minSize,
      onError,
      disabled,
      onDrop: (acceptedFiles, fileRejections, event) => {
        if (fileRejections.length > 0) {
          const message = fileRejections.at(0)?.errors.at(0)?.message;
          onError?.(new Error(message));
          return;
        }

        onDrop?.(acceptedFiles, fileRejections, event);
      },
      ...props,
    });

    return (
      <DropzoneContext.Provider key={JSON.stringify(src)} value={{ src, accept, maxSize, minSize, maxFiles }}>
        <Button
          ref={ref}
          type="button"
          disabled={disabled}
          variant="outline"
          data-testid={testId}
          className={cn(
            'group relative h-auto w-full flex-col overflow-hidden p-8',
            isDragActive && 'outline-none ring-1 ring-ring',
            className,
          )}
          {...getRootProps()}
        >
          <input {...getInputProps()} disabled={disabled} />
          {children}
        </Button>
      </DropzoneContext.Provider>
    );
  },
);

Dropzone.displayName = 'Dropzone';

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext);

  if (!context) {
    throw new Error('useDropzoneContext must be used within a Dropzone');
  }

  return context;
};

export type DropzoneContentProps = {
  children?: React.ReactNode;
  className?: string;
};

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
      <p className="my-2 w-full truncate font-medium text-sm">
        {src.length > maxLabelItems
          ? `${src
              .slice(0, maxLabelItems)
              .map((file) => file.name)
              .join(', ')} and ${src.length - maxLabelItems} more`
          : src.map((file) => file.name).join(', ')}
      </p>
      <p className="w-full text-wrap text-muted-foreground text-xs">Drag and drop or click to replace</p>
    </div>
  );
};

export type DropzoneEmptyStateProps = {
  children?: React.ReactNode;
  className?: string;
};

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
    caption += Object.keys(accept).join(', ');
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
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
        <UploadIcon size={16} />
      </div>
      <p className="my-2 w-full truncate text-wrap font-medium text-sm">Upload {maxFiles === 1 ? 'a file' : 'files'}</p>
      <p className="w-full truncate text-wrap text-muted-foreground text-xs">Drag and drop or click to upload</p>
      {caption && <p className="text-wrap text-muted-foreground text-xs">{caption}.</p>}
    </div>
  );
};
