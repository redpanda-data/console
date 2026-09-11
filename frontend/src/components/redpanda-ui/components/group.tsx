'use client';
import React, { createContext, useContext } from 'react';

import { cn, type SharedProps } from '../lib/utils';

type GroupPosition = 'first' | 'middle' | 'last';

type GroupContextValue = {
  position?: GroupPosition;
  attached: boolean;
};

const GroupContext = createContext<GroupContextValue>({
  position: undefined,
  attached: false,
});

const useGroup = () => useContext(GroupContext);

const Group = ({
  children,
  className,
  testId,
  attached = false,
}: {
  children: React.ReactNode;
  className?: string;
  attached?: boolean;
} & SharedProps) => {
  const childrenArray = React.Children.toArray(children).filter((child) => React.isValidElement(child));
  const childCount = childrenArray.length;

  const content = childrenArray.map((child, index) => {
    const getPosition = (): GroupPosition | undefined => {
      if (!attached || childCount === 1) {
        return;
      }
      if (index === 0) {
        return 'first';
      }
      if (index === childCount - 1) {
        return 'last';
      }
      return 'middle';
    };

    const position = getPosition();
    const element = child as React.ReactElement;
    const key = element.key || `group-item-${index}`;

    return (
      <GroupContext.Provider
        key={key}
        value={{
          position,
          attached,
        }}
      >
        {child}
      </GroupContext.Provider>
    );
  });

  return (
    <div className={cn('flex w-full items-stretch', !attached && 'items-end gap-1.5', className)} data-testid={testId}>
      {content}
    </div>
  );
};

/**
 * Border and radius classes for one item inside an attached Group. Every item keeps its complete
 * border and each after the first is pulled a pixel left, so adjacent borders overlap into one
 * hairline — dropping a side instead leaves the boundary bare where both neighbours do it. Focused
 * items lift with `z-index`, since the ring draws outside the box and the neighbour would clip it.
 * Horizontal only: `Group` has no vertical attached mode, so no position is assigned there.
 */
const groupItemClasses = (attached: boolean, position: GroupPosition | undefined): string => {
  if (!(attached && position)) {
    return 'rounded-md';
  }
  const lift = 'focus-visible:relative focus-visible:z-10';
  if (position === 'first') {
    return `rounded-l-md rounded-r-none ${lift}`;
  }
  if (position === 'last') {
    return `-ml-px rounded-r-md rounded-l-none ${lift}`;
  }
  return `-ml-px rounded-none ${lift}`;
};

export { Group, groupItemClasses, useGroup, type GroupPosition, type GroupContextValue };
