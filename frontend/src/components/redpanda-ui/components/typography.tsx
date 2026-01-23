import { cva, type VariantProps } from 'class-variance-authority';
import React, { forwardRef } from 'react';
import { Link as ReactRouterLink, type To } from 'react-router-dom';

import { cn, type SharedProps } from '../lib/utils';

// Heading variants using cva
// Based on Figma design system: Inter Display, font-medium (500), 100% line-height, -0.01em tracking
const headingVariants = cva('font-display font-medium leading-none tracking-heading', {
  variants: {
    level: {
      1: 'text-2xl',
      2: 'text-xl',
      3: 'text-lg',
      4: 'text-md',
      5: 'text-sm',
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

export const textVariants = cva('font-sans', {
  variants: {
    variant: {
      // Legacy variant names (mapped to Figma equivalents - NOT backward compatible for styles)
      body: 'font-normal text-sm leading-6 tracking-heading', // → bodyMedium
      lead: 'font-normal text-lg text-muted-foreground leading-7 tracking-heading', // → bodyLarge + muted
      large: 'font-normal text-base leading-7 tracking-heading', // → bodyXLarge
      small: 'font-normal text-xs leading-5 tracking-normal', // → bodyMedium
      muted: 'font-normal text-muted-foreground text-sm leading-5 tracking-normal', // → bodyMedium + muted
      label: 'font-semibold text-sm leading-5 tracking-normal', // → labelStrongSmall
      xLarge: 'font-display font-medium text-lg leading-6 tracking-heading', // → titleXSmall

      // Titles - Inter Display, font-medium (500)
      titleLarge: 'font-display font-medium text-4xl leading-10 tracking-heading', // 2rem, line-height 2.5rem
      titleMedium: 'font-display font-medium text-2xl leading-8 tracking-heading', // 1.5rem, line-height 2rem
      titleMediumSemibold: 'font-display font-semibold text-2xl leading-8 tracking-heading', // 1.5rem, 600, line-height 2rem
      titleSmall: 'font-display font-medium text-xl leading-7 tracking-heading', // 1.25rem, line-height 1.75rem
      titleXSmall: 'font-display font-medium text-lg leading-6 tracking-heading', // 1.125rem, line-height 1.5rem

      // Labels - Inter, font-normal (400)
      labelLarge: 'font-normal text-lg leading-6 tracking-label', // 1.125rem, line-height 1.5rem, -0.0125em
      labelMedium: 'font-normal text-base leading-6 tracking-tight', // 1rem, line-height 1.5rem, -0.025em
      labelSmall: 'font-normal text-sm leading-5 tracking-normal', // 0.875rem, line-height 1.25rem
      labelXSmall: 'font-normal text-xs leading-4 tracking-normal', // 0.75rem, line-height 1rem

      // Label Strong variants - Inter, font-semibold (600)
      labelStrongLarge: 'font-semibold text-lg leading-6 tracking-heading', // 1.125rem, line-height 1.5rem, -0.01em
      labelStrongMedium: 'font-semibold text-base leading-6 tracking-heading', // 1rem, line-height 1.5rem, -0.01em
      labelStrongSmall: 'font-semibold text-sm leading-5 tracking-normal', // 0.875rem, line-height 1.25rem
      labelStrongXSmall: 'font-semibold text-xs leading-4 tracking-normal', // 0.75rem, line-height 1rem

      // Body - Inter, font-normal (400)
      bodyXLarge: 'font-normal text-lg leading-7 tracking-heading', // 1.125rem, line-height 1.75rem, -0.01em
      bodyLarge: 'font-normal text-base leading-6 tracking-heading', // 1rem, line-height 1.5rem, -0.01em
      bodyMedium: 'font-normal text-sm leading-5 tracking-normal', // 0.875rem, line-height 1.25rem
      bodySmall: 'font-normal text-xs leading-4 tracking-normal', // 0.75rem, line-height 1rem

      // Body Strong variants - Inter, font-medium (500)
      bodyStrongXLarge: 'font-medium text-lg leading-7 tracking-heading', // 1.125rem, line-height 1.75rem, -0.01em
      bodyStrongLarge: 'font-medium text-base leading-6 tracking-heading', // 1rem, line-height 1.5rem, -0.01em
      bodyStrongMedium: 'font-medium text-sm leading-5 tracking-normal', // 0.875rem, line-height 1.25rem
      bodyStrongSmall: 'font-medium text-xs leading-4 tracking-normal', // 0.75rem, line-height 1rem

      // Buttons - Inter, font-semibold (600), line-height 100%
      buttonLarge: 'font-semibold text-lg leading-none tracking-heading', // 1.125rem, -0.01em
      buttonMedium: 'font-semibold text-base leading-none tracking-normal', // 1rem
      buttonSmall: 'font-semibold text-sm leading-none tracking-normal', // 0.875rem
      buttonXSmall: 'font-semibold text-xs leading-none tracking-heading', // 0.75rem, -0.01em

      // Numbers - Inter, font-normal (400), tighter tracking for tabular display
      numberLarge: 'font-normal text-lg tabular-nums leading-6 tracking-number', // 1.125rem, -0.05em
      numberMedium: 'font-normal text-base tabular-nums leading-6 tracking-number', // 1rem, -0.05em
      numberSmall: 'font-normal text-sm tabular-nums leading-5 tracking-number', // 0.875rem, -0.05em
      numberXSmall: 'font-normal text-xs tabular-nums leading-4 tracking-number-tight', // 0.75rem, -0.025em

      // Number Strong variants - Inter, font-medium (500)
      numberStrongLarge: 'font-medium text-lg tabular-nums leading-6 tracking-number', // 1.125rem, -0.05em
      numberStrongMedium: 'font-medium text-base tabular-nums leading-6 tracking-number', // 1rem, -0.05em
      numberStrongSmall: 'font-medium text-sm tabular-nums leading-5 tracking-number', // 0.875rem, -0.05em
      numberStrongXSmall: 'font-medium text-xs tabular-nums leading-4 tracking-number-tight', // 0.75rem, -0.025em

      // Captions - Inter, font-normal (400), positive tracking
      captionMedium: 'font-normal text-xs leading-4 tracking-caption', // 0.75rem, 0.01em
      captionSmall: 'font-normal text-caption-sm leading-4 tracking-caption', // 0.625rem (10px), 0.01em

      // Caption Strong variants - Inter, font-medium (500)
      captionStrongMedium: 'font-medium text-xs leading-4 tracking-caption', // 0.75rem, 0.01em
      captionStrongSmall: 'font-medium text-caption-sm leading-4 tracking-caption-wide', // 0.625rem, 0.05em
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
  },
  defaultVariants: {
    variant: 'body',
    align: 'left',
  },
});

// Main Heading Component
interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants>,
    SharedProps {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5';
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>((componentProps, ref) => {
  const { align, className, children, testId, as, level: levelProp, ...props } = componentProps;
  const headingLevel = levelProp ?? 1;
  const HeadingTag = as ?? (`h${headingLevel}` as keyof React.JSX.IntrinsicElements);

  return React.createElement(
    HeadingTag,
    {
      ref,
      className: cn(headingVariants({ level: headingLevel, align }), className),
      'data-testid': testId,
      ...props,
    },
    children
  );
});

// Text Component
interface TextProps extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof textVariants>, SharedProps {
  children: React.ReactNode;
  as?: 'p' | 'div' | 'span' | 'small';
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
interface BlockquoteProps extends React.HTMLAttributes<HTMLQuoteElement>, SharedProps {
  children: React.ReactNode;
}

export function Blockquote({ className, children, testId, ...props }: BlockquoteProps) {
  return (
    <blockquote className={cn('border-l-2 pl-6 italic', className)} data-testid={testId} {...props}>
      {children}
    </blockquote>
  );
}

// List Component
interface ListProps extends React.HTMLAttributes<HTMLUListElement | HTMLOListElement>, SharedProps {
  children: React.ReactNode;
  ordered?: boolean;
}

export function List({ ordered = false, className, children, testId, ...props }: ListProps) {
  const ListTag = ordered ? 'ol' : 'ul';
  const listClass = ordered ? 'mt-1 mb-3 ml-6 list-decimal [&>li]:mt-1' : 'mt-1 mb-3 ml-6 list-disc [&>li]:mt-0.5';

  return (
    <ListTag className={cn(listClass, className)} data-testid={testId} {...props}>
      {children}
    </ListTag>
  );
}

// List Item Component
interface ListItemProps extends React.HTMLAttributes<HTMLLIElement>, SharedProps {
  children: React.ReactNode;
}

export function ListItem({ className, children, testId, ...props }: ListItemProps) {
  return (
    <li className={className} data-testid={testId} {...props}>
      {children}
    </li>
  );
}

// Optional List Item Text component to emulate prose p-in-li behavior
interface ListItemTextProps extends React.HTMLAttributes<HTMLParagraphElement>, SharedProps {
  children: React.ReactNode;
}

export function ListItemText({ className, children, testId, ...props }: ListItemTextProps) {
  return (
    <p className={cn('my-0 inline', className)} data-testid={testId} {...props}>
      {children}
    </p>
  );
}

// Inline Code Component
interface InlineCodeProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export function InlineCode({ className, children, testId, ...props }: InlineCodeProps) {
  return (
    <code
      className={cn('relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm', className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </code>
  );
}

// Base props shared by both link types
type BaseLinkProps = SharedProps & {
  children: React.ReactNode;
  className?: string;
};

// Discriminated union for link types
type LinkProps =
  | (BaseLinkProps &
      React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        as?: never; // Default to anchor - don't allow 'as' when using anchor
        href: string;
      })
  | (BaseLinkProps &
      React.ComponentProps<typeof ReactRouterLink> & {
        as: typeof ReactRouterLink;
        to: To;
      });

// Link styles matching Figma: primary color, dotted underline with offset
const linkStyles =
  'font-medium text-primary decoration-dotted underline underline-offset-[3px] hover:text-primary/80 transition-colors';

export function Link({ className, children, testId, ...props }: LinkProps) {
  if ('as' in props && props.as === ReactRouterLink) {
    // Render as React Router Link when explicitly specified
    const { as: _, ...routerProps } = props;
    return (
      <ReactRouterLink className={cn(linkStyles, className)} data-testid={testId} {...routerProps}>
        {children}
      </ReactRouterLink>
    );
  }
  // Render as anchor tag (default)

  return (
    <a className={cn(linkStyles, className)} data-testid={testId} {...props}>
      {children}
    </a>
  );
}

const preVariants = cva('bg-muted rounded-md text-sm overflow-y-auto', {
  variants: {
    variant: {
      standard: 'p-4 my-6',
      dense: 'p-2',
    },
  },
  defaultVariants: {
    variant: 'standard',
  },
});

export type PreVariants = VariantProps<typeof preVariants>['variant'];

// Preformatted Code Block Component
interface PreProps extends React.HTMLAttributes<HTMLPreElement>, SharedProps {
  children: React.ReactNode;
  variant?: PreVariants;
}

export function Pre({ className, children, testId, variant = 'standard', ...props }: PreProps) {
  return (
    <pre
      className={cn(preVariants({ variant }), className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </pre>
  );
}

// Horizontal Rule Component
interface HrProps extends React.HTMLAttributes<HTMLHRElement>, SharedProps {}

export function Hr({ className, testId, ...props }: HrProps) {
  return <hr className={cn('my-10', className)} data-testid={testId} {...props} />;
}

// Description List Components
interface DlProps extends React.HTMLAttributes<HTMLDListElement>, SharedProps {
  children: React.ReactNode;
}

export function Dl({ className, children, testId, ...props }: DlProps) {
  return (
    <dl className={cn('my-6', className)} data-testid={testId} {...props}>
      {children}
    </dl>
  );
}

interface DtProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export function Dt({ className, children, testId, ...props }: DtProps) {
  return (
    <dt className={cn('font-semibold tracking-tight', className)} data-testid={testId} {...props}>
      {children}
    </dt>
  );
}

interface DdProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export function Dd({ className, children, testId, ...props }: DdProps) {
  return (
    <dd className={className} data-testid={testId} {...props}>
      {children}
    </dd>
  );
}

// Details/Summary Components
interface DetailsProps extends React.DetailsHTMLAttributes<HTMLDetailsElement>, SharedProps {
  children: React.ReactNode;
}

export function Details({ className, children, testId, ...props }: DetailsProps) {
  return (
    <details className={className} data-testid={testId} {...props}>
      {children}
    </details>
  );
}

interface SummaryProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export function Summary({ className, children, testId, ...props }: SummaryProps) {
  return (
    <summary className={cn('cursor-pointer font-semibold tracking-tight', className)} data-testid={testId} {...props}>
      {children}
    </summary>
  );
}

// Marked/Highlight Component
interface MarkProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export function Mark({ className, children, testId, ...props }: MarkProps) {
  return (
    <mark className={cn('bg-yellow-200', className)} data-testid={testId} {...props}>
      {children}
    </mark>
  );
}

// Small text Component
interface SmallProps extends React.HTMLAttributes<HTMLElement>, SharedProps {
  children: React.ReactNode;
}

export function Small({ className, children, testId, ...props }: SmallProps) {
  return (
    <small className={cn('text-xs leading-none', className)} data-testid={testId} {...props}>
      {children}
    </small>
  );
}
