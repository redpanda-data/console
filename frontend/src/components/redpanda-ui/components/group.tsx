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
    <div className={cn('flex w-full items-end', !attached && 'gap-1.5', className)} data-testid={testId}>
      {content}
    </div>
  );
};

export { Group, useGroup, type GroupPosition, type GroupContextValue };
