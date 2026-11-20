'use client';

import { Link as TanStackLink } from '@tanstack/react-router';
import { cva } from 'class-variance-authority';
import React from 'react';
import { cn, type SharedProps } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';

interface BlockquoteProps extends React.HTMLAttributes<HTMLQuoteElement>, SharedProps {
  children: React.ReactNode;
}

export const Blockquote = ({
  className,
  children,
  testId,
  ref,
  ...props
}: BlockquoteProps & { ref?: React.Ref<HTMLQuoteElement> | undefined }) => (
  <blockquote className={cn('border-l-2 pl-6 italic', className)} data-testid={testId} ref={ref} {...props}>
    {children}
  </blockquote>
);

interface ListProps extends React.HTMLAttributes<HTMLUListElement | HTMLOListElement>, SharedProps {
  children: React.ReactNode;
  ordered?: boolean | undefined;
}

export const List = ({
  ref,
  ...componentProps
}: ListProps & { ref?: React.Ref<HTMLUListElement | HTMLOListElement> | undefined }) => {
  const { ordered = false, className, children, testId, ...props } = componentProps;
  const ListTag = ordered ? 'ol' : 'ul';
  const listClass = ordered ? 'mt-1 mb-3 ml-6 list-decimal [&>li]:mt-1' : 'mt-1 mb-3 ml-6 list-disc [&>li]:mt-0.5';

  return React.createElement(
    ListTag,
    {
      ref,
      className: cn(listClass, className),
      'data-testid': testId,
      ...props,
    },
    children
  );
};

interface ListItemProps extends React.HTMLAttributes<HTMLLIElement>, SharedProps {
  children: React.ReactNode;
}

export const ListItem = ({
  className,
  children,
  testId,
  ref,
  ...props
}: ListItemProps & { ref?: React.Ref<HTMLLIElement> | undefined }) => (
  <li className={className} data-testid={testId} ref={ref} {...props}>
    {children}
  </li>
);

// Emulates prose p-in-li behavior.
interface ListItemTextProps extends React.HTMLAttributes<HTMLParagraphElement>, SharedProps {
  children: React.ReactNode;
}

export const ListItemText = ({
  className,
  children,
  testId,
  ref,
  ...props
}: ListItemTextProps & { ref?: React.Ref<HTMLParagraphElement> | undefined }) => (
  <p className={cn('my-0 inline', className)} data-testid={testId} ref={ref} {...props}>
    {children}
  </p>
);

interface InlineCodeProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export const InlineCode = ({
  className,
  children,
  testId,
  ref,
  ...props
}: InlineCodeProps & { ref?: React.Ref<HTMLElement> | undefined }) => (
  <code
    className={cn(
      'relative rounded bg-surface-subtle px-[0.3rem] py-[0.2rem] font-mono text-sm leading-8 font-semibold',
      className
    )}
    data-testid={testId}
    ref={ref}
    {...props}
  >
    {children}
  </code>
);

type BaseLinkProps = SharedProps & {
  children: React.ReactNode;
  className?: string | undefined;
  /** `current` inherits the surrounding ink — use it for a link on a filled or inverse ground. */
  tone?: 'action' | 'current' | undefined;
};

// TanStack Router variant uses explicit props because ComponentProps<typeof TanStackLink> ties params to a route literal, which breaks when `to` is a plain string.
type LinkProps =
  | (BaseLinkProps &
      React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        as?: undefined;
        href: string;
      })
  | (BaseLinkProps & {
      as: typeof TanStackLink;
      to: string;
      params?: Record<string, string> | undefined;
      search?: Record<string, unknown> | undefined;
      hash?: string | undefined;
      replace?: boolean | undefined;
      preload?: false | 'intent' | 'render' | 'viewport' | undefined;
      [key: string]: unknown;
    });

// Figma link style: primary color, dotted underline with offset.
const linkVariants = cva(
  'font-medium underline decoration-dotted underline-offset-[3px] transition-colors hover:decoration-solid focus-visible:decoration-solid has-[>svg]:inline-flex has-[>svg]:items-center has-[>svg]:gap-1 motion-reduce:transition-none [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        action: 'text-action-primary hover:text-action-primary-hover',
        // For a link on a filled ground. Both states pinned, so no `hover:text-*` outranks a
        // caller's colour; the dotted -> solid underline carries the affordance.
        current: 'text-current hover:text-current',
      },
    },
    defaultVariants: {
      tone: 'action',
    },
  }
);

export const Link = ({ ref, ...componentProps }: LinkProps & { ref?: React.Ref<HTMLAnchorElement> | undefined }) => {
  // Re-assert the union: forwardRef's PropsWithoutRef collapses the index-signature branch, widening className/children to `unknown`.
  const { className, children, testId, tone, ...props } = componentProps;

  if ('as' in props && props.as === TanStackLink) {
    const { as: _, ...routerProps } = props;
    return (
      <TanStackLink
        className={cn(linkVariants({ tone }), className)}
        data-testid={testId}
        ref={ref}
        {...omitUndefined(routerProps)}
      >
        {children}
      </TanStackLink>
    );
  }

  return (
    <a className={cn(linkVariants({ tone }), className)} data-testid={testId} ref={ref} {...props}>
      {children}
    </a>
  );
};

interface PreProps extends React.HTMLAttributes<HTMLPreElement>, SharedProps {
  children: React.ReactNode;
}

export const Pre = ({
  className,
  children,
  testId,
  ref,
  ...props
}: PreProps & { ref?: React.Ref<HTMLPreElement> | undefined }) => (
  <pre
    className={cn('my-6 overflow-y-auto rounded-md bg-surface-subtle p-4 text-sm', className)}
    data-testid={testId}
    ref={ref}
    {...props}
  >
    {children}
  </pre>
);

interface HrProps extends React.HTMLAttributes<HTMLHRElement>, SharedProps {}

export const Hr = ({ className, testId, ref, ...props }: HrProps & { ref?: React.Ref<HTMLHRElement> | undefined }) => (
  <hr className={cn('my-10', className)} data-testid={testId} ref={ref} {...props} />
);

interface DlProps extends React.HTMLAttributes<HTMLDListElement>, SharedProps {
  children: React.ReactNode;
}

export const Dl = ({
  className,
  children,
  testId,
  ref,
  ...props
}: DlProps & { ref?: React.Ref<HTMLDListElement> | undefined }) => (
  <dl className={cn('my-6', className)} data-testid={testId} ref={ref} {...props}>
    {children}
  </dl>
);

interface DtProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export const Dt = ({
  className,
  children,
  testId,
  ref,
  ...props
}: DtProps & { ref?: React.Ref<HTMLElement> | undefined }) => (
  <dt className={cn('font-semibold tracking-tight', className)} data-testid={testId} ref={ref} {...props}>
    {children}
  </dt>
);

interface DdProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export const Dd = ({
  className,
  children,
  testId,
  ref,
  ...props
}: DdProps & { ref?: React.Ref<HTMLElement> | undefined }) => (
  <dd className={className} data-testid={testId} ref={ref} {...props}>
    {children}
  </dd>
);

interface DetailsProps extends React.DetailsHTMLAttributes<HTMLDetailsElement>, SharedProps {
  children: React.ReactNode;
}

export const Details = ({
  className,
  children,
  testId,
  ref,
  ...props
}: DetailsProps & { ref?: React.Ref<HTMLDetailsElement> | undefined }) => (
  <details className={className} data-testid={testId} ref={ref} {...props}>
    {children}
  </details>
);

interface SummaryProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export const Summary = ({
  className,
  children,
  testId,
  ref,
  ...props
}: SummaryProps & { ref?: React.Ref<HTMLElement> | undefined }) => (
  <summary
    // Prose disclosure, so the ink steps rather than a fill appearing (Accordion's trigger has
    // a fill and steps that instead). Opening the panel is the pressed feedback.
    className={cn(
      'cursor-pointer font-semibold tracking-tight transition-colors hover:text-strong motion-reduce:transition-none',
      className
    )}
    data-testid={testId}
    ref={ref}
    {...props}
  >
    {children}
  </summary>
);

interface MarkProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export const Mark = ({
  className,
  children,
  testId,
  ref,
  ...props
}: MarkProps & { ref?: React.Ref<HTMLElement> | undefined }) => (
  <mark className={cn('bg-mark text-mark-foreground', className)} data-testid={testId} ref={ref} {...props}>
    {children}
  </mark>
);

// displayName on each forwardRef so DevTools/stacks show the real name instead of "ForwardRef".
Blockquote.displayName = 'Blockquote';
List.displayName = 'List';
ListItem.displayName = 'ListItem';
ListItemText.displayName = 'ListItemText';
InlineCode.displayName = 'InlineCode';
Link.displayName = 'Link';
Pre.displayName = 'Pre';
Hr.displayName = 'Hr';
Dl.displayName = 'Dl';
Dt.displayName = 'Dt';
Dd.displayName = 'Dd';
Details.displayName = 'Details';
Summary.displayName = 'Summary';
Mark.displayName = 'Mark';
