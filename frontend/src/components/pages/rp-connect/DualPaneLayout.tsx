/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Box } from '@redpanda-data/ui';
import React, { useEffect, useState } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../resizable';

interface DualPaneLayoutProps {
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  storageKey?: string;
  className?: string;
}

const STORAGE_KEY_PREFIX = 'redpanda-dual-pane-layout';

export const DualPaneLayout: React.FC<DualPaneLayoutProps> = ({
  leftPane,
  rightPane,
  defaultLeftWidth = 50,
  minLeftWidth = 20,
  maxLeftWidth = 80,
  storageKey = 'default',
  className,
}) => {
  const [leftPanelSize, setLeftPanelSize] = useState(defaultLeftWidth);
  const [rightPanelSize, setRightPanelSize] = useState(100 - defaultLeftWidth);
  const [isClient, setIsClient] = useState(false);

  const fullStorageKey = `${STORAGE_KEY_PREFIX}-${storageKey}`;

  // Load saved sizes from localStorage on mount
  useEffect(() => {
    setIsClient(true);
    const savedLeftSize = localStorage.getItem(`${fullStorageKey}-left`);
    const savedRightSize = localStorage.getItem(`${fullStorageKey}-right`);
    
    if (savedLeftSize && savedRightSize) {
      const leftSize = Number(savedLeftSize);
      const rightSize = Number(savedRightSize);
      
      // Validate the sizes
      if (leftSize >= minLeftWidth && leftSize <= maxLeftWidth) {
        setLeftPanelSize(leftSize);
        setRightPanelSize(rightSize);
      }
    }
  }, [fullStorageKey, minLeftWidth, maxLeftWidth]);

  // Save sizes to localStorage when they change
  const handleResize = (sizes: number[]) => {
    const [leftSize, rightSize] = sizes;
    setLeftPanelSize(leftSize);
    setRightPanelSize(rightSize);
    
    if (isClient) {
      localStorage.setItem(`${fullStorageKey}-left`, leftSize.toString());
      localStorage.setItem(`${fullStorageKey}-right`, rightSize.toString());
    }
  };

  // Don't render until client-side hydration is complete to avoid SSR mismatch
  if (!isClient) {
    return (
      <Box className={className} display="flex" height="100%">
        <Box flex={`0 0 ${defaultLeftWidth}%`}>{leftPane}</Box>
        <Box flex={`0 0 ${100 - defaultLeftWidth}%`}>{rightPane}</Box>
      </Box>
    );
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className={className}
      onLayout={handleResize}
      style={{ height: '100%' }}
    >
      <ResizablePanel
        defaultSize={leftPanelSize}
        minSize={minLeftWidth}
        maxSize={maxLeftWidth}
      >
        <Box height="100%" width="100%" overflow="hidden">
          {leftPane}
        </Box>
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={rightPanelSize}>
        <Box height="100%" width="100%" overflow="hidden">
          {rightPane}
        </Box>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default DualPaneLayout;