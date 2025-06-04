import { BaseHandle } from '@/components/node-editor/base-handle';
import { type HandleProps, Position } from '@xyflow/react';

const wrapperClassNames: Record<Position, string> = {
  [Position.Top]: 'flex-col-reverse left-1/2 -translate-y-full -translate-x-1/2',
  [Position.Bottom]: 'flex-col left-1/2 translate-y-[10px] -translate-x-1/2',
  [Position.Left]: 'flex-row-reverse top-1/2 -translate-x-full -translate-y-1/2',
  [Position.Right]: 'top-1/2 -translate-y-1/2 translate-x-[10px]',
};

export const ButtonHandle = ({
  showButton = true,
  position = Position.Bottom,
  children,
  ...props
}: HandleProps & { showButton?: boolean }) => {
  const wrapperClassName = wrapperClassNames[position || Position.Bottom];
  const vertical = position === Position.Top || position === Position.Bottom;

  return (
    <BaseHandle position={position} id={props.id} {...props}>
      {showButton && (
        <div className={`absolute flex items-center ${wrapperClassName} pointer-events-none`}>
          <div className={`bg-gray-300 ${vertical ? 'h-10 w-[1px]' : 'h-[1px] w-10'}`} />
          <div className="nodrag nopan pointer-events-auto">{children}</div>
        </div>
      )}
    </BaseHandle>
  );
};
