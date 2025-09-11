import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';

// Heading variants using cva
const headingVariants = cva('font-semibold !leading-none', {
  variants: {
    level: {
      1: 'text-[1.71rem]',
      2: 'text-[1.29rem]',
      3: 'text-[1.14rem]',
      4: 'text-[1rem]',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
  },
  defaultVariants: {
    level: 1,
    align: 'left',
  },
});

const textVariants = cva('leading-[1.5]', {
  variants: {
    variant: {
      default: '',
      lead: 'text-muted-foreground text-[1.28rem]',
      large: 'text-[1.14rem]',
      small: 'text-[0.875rem]',
      muted: 'text-muted-foreground text-[0.85rem]',
      label: 'text-[0.875rem] font-bold',
      xLarge: 'text-[1.25rem]',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
  },
  defaultVariants: {
    variant: 'default',
    align: 'left',
  },
});

// Main Heading Component
interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement>, VariantProps<typeof headingVariants> {
  children: React.ReactNode;
  testId?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

export function Heading({ level = 1, align, className, children, testId, as, ...props }: HeadingProps) {
  const HeadingTag = as ?? (`h${level}` as keyof React.JSX.IntrinsicElements);

  return React.createElement(
    HeadingTag,
    {
      className: cn(headingVariants({ level, align }), className),
      'data-testid': testId,
      ...props,
    },
    children,
  );
}

// Text Component
interface TextProps extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof textVariants> {
  children: React.ReactNode;
  as?: 'p' | 'div' | 'span' | 'small';
  testId?: string;
}

export function Text({ variant, align, as = 'p', className, children, testId, ...props }: TextProps) {
  const Component = as;

  return (
    <Component className={cn(textVariants({ variant, align }), className)} data-testid={testId} {...props}>
      {children}
    </Component>
  );
}

// Blockquote Component
interface BlockquoteProps extends React.HTMLAttributes<HTMLQuoteElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Blockquote({ className, children, testId, ...props }: BlockquoteProps) {
  return (
    <blockquote className={cn('border-l-2 pl-6 italic', className)} data-testid={testId} {...props}>
      {children}
    </blockquote>
  );
}

// List Component
interface ListProps extends React.HTMLAttributes<HTMLUListElement | HTMLOListElement> {
  children: React.ReactNode;
  ordered?: boolean;
  testId?: string;
}

export function List({ ordered = false, className, children, testId, ...props }: ListProps) {
  const ListTag = ordered ? 'ol' : 'ul';
  const listClass = ordered ? 'my-6 ml-6 list-decimal [&>li]:mt-2' : 'my-6 ml-6 list-disc [&>li]:mt-2';

  return (
    <ListTag className={cn(listClass, className)} data-testid={testId} {...props}>
      {children}
    </ListTag>
  );
}

// List Item Component
interface ListItemProps extends React.HTMLAttributes<HTMLLIElement> {
  children: React.ReactNode;
  testId?: string;
}

export function ListItem({ className, children, testId, ...props }: ListItemProps) {
  return (
    <li className={className} data-testid={testId} {...props}>
      {children}
    </li>
  );
}

// Optional List Item Text component to emulate prose p-in-li behavior
interface ListItemTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
  testId?: string;
}

export function ListItemText({ className, children, testId, ...props }: ListItemTextProps) {
  return (
    <p className={cn('my-0 inline', className)} data-testid={testId} {...props}>
      {children}
    </p>
  );
}

// Inline Code Component
interface InlineCodeProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  testId?: string;
}

export function InlineCode({ className, children, testId, ...props }: InlineCodeProps) {
  return (
    <code
      className={cn('bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold', className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </code>
  );
}

// Anchor Link Component
interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Link({ className, children, testId, ...props }: LinkProps) {
  return (
    <a
      className={cn('font-medium text-primary underline underline-offset-4', className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </a>
  );
}

// Preformatted Code Block Component
interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Pre({ className, children, testId, ...props }: PreProps) {
  return (
    <pre
      className={cn('bg-muted rounded-md p-4 my-6 text-sm overflow-y-auto', className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </pre>
  );
}

// Horizontal Rule Component
interface HrProps extends React.HTMLAttributes<HTMLHRElement> {
  testId?: string;
}

export function Hr({ className, testId, ...props }: HrProps) {
  return <hr className={cn('my-10', className)} data-testid={testId} {...props} />;
}

// Description List Components
interface DlProps extends React.HTMLAttributes<HTMLDListElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Dl({ className, children, testId, ...props }: DlProps) {
  return (
    <dl className={cn('my-6', className)} data-testid={testId} {...props}>
      {children}
    </dl>
  );
}

interface DtProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Dt({ className, children, testId, ...props }: DtProps) {
  return (
    <dt className={cn('font-semibold tracking-tight', className)} data-testid={testId} {...props}>
      {children}
    </dt>
  );
}

interface DdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Dd({ className, children, testId, ...props }: DdProps) {
  return (
    <dd className={className} data-testid={testId} {...props}>
      {children}
    </dd>
  );
}

// Details/Summary Components
interface DetailsProps extends React.DetailsHTMLAttributes<HTMLDetailsElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Details({ className, children, testId, ...props }: DetailsProps) {
  return (
    <details className={className} data-testid={testId} {...props}>
      {children}
    </details>
  );
}

interface SummaryProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Summary({ className, children, testId, ...props }: SummaryProps) {
  return (
    <summary className={cn('cursor-pointer font-semibold tracking-tight', className)} data-testid={testId} {...props}>
      {children}
    </summary>
  );
}

// Marked/Highlight Component
interface MarkProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Mark({ className, children, testId, ...props }: MarkProps) {
  return (
    <mark className={cn('bg-yellow-300', className)} data-testid={testId} {...props}>
      {children}
    </mark>
  );
}

// Small text Component
interface SmallProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  testId?: string;
}

export function Small({ className, children, testId, ...props }: SmallProps) {
  return (
    <small className={cn('text-xs leading-none', className)} data-testid={testId} {...props}>
      {children}
    </small>
  );
}
