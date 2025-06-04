import { type XYPosition, useReactFlow } from '@xyflow/react';
import { type MouseEvent, useState } from 'react';

export function useClientPosition(): [XYPosition | null, (e: MouseEvent) => void] {
  const [position, _setPosition] = useState<XYPosition | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const setPosition = (e: MouseEvent) => _setPosition(screenToFlowPosition({ x: e.clientX, y: e.clientY }));

  return [position, setPosition];
}
