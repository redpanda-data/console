'use client';

import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

import { type LabelAppearance, labelStyles } from './label/label-styles';

interface LabelProps extends React.ComponentProps<'label'>, SharedProps, LabelAppearance {}

const Label = ({
  className,
  inset = false,
  invalid = false,
  size,
  surface,
  variant = 'default',
  testId,
  ...props
}: LabelProps) => (
  <label
    className={cn(labelStyles({ inset, invalid, size, surface, variant }), className)}
    data-slot="label"
    data-surface={surface}
    data-testid={testId}
    {...props}
  />
);

export { Label, type LabelProps };
