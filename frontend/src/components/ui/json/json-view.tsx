/** biome-ignore-all lint/suspicious/noArrayIndexKey: part of JSONNode implementation */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: part of JSONNode implementation */
import clsx from 'clsx';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { memo, useMemo, useState } from 'react';

import type { JSONValue } from './json-utils';
import { getDataType, tryParseJSON } from './json-utils';

interface JSONViewProps {
  data: unknown;
  name?: string;
  initialExpandDepth?: number;
  className?: string;
  withCopyButton?: boolean;
  isError?: boolean;
}

const JSONView = memo(
  ({ data, name, initialExpandDepth = 3, className, withCopyButton = true, isError = false }: JSONViewProps) => {
    const normalizedData = useMemo(() => {
      return typeof data === 'string' ? (tryParseJSON(data).success ? tryParseJSON(data).data : data) : data;
    }, [data]);

    const copyContent = useMemo(() => {
      return typeof normalizedData === 'string' ? normalizedData : JSON.stringify(normalizedData, null, 2);
    }, [normalizedData]);

    return (
      <div className={clsx('p-4 border rounded relative', className)}>
        {withCopyButton && (
          <CopyButton className="absolute top-2 right-2" content={copyContent} size="icon" variant="ghost" />
        )}
        <div className="font-mono text-sm transition-all duration-300">
          <JSONNode
            data={normalizedData as JSONValue}
            depth={0}
            initialExpandDepth={initialExpandDepth}
            isError={isError}
            name={name}
          />
        </div>
      </div>
    );
  }
);

JSONView.displayName = 'JSONView';

interface JSONNodeProps {
  data: JSONValue;
  name?: string;
  depth: number;
  initialExpandDepth: number;
  isError?: boolean;
}

const JSONNode = memo(({ data, name, depth = 0, initialExpandDepth, isError = false }: JSONNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(depth < initialExpandDepth);
  const [typeStyleMap] = useState<Record<string, string>>({
    number: 'text-blue-600',
    boolean: 'text-amber-600',
    null: 'text-purple-600',
    undefined: 'text-gray-600',
    string: 'text-green-600 group-hover:text-green-500',
    error: 'text-red-600 group-hover:text-red-500',
    default: 'text-gray-700',
  });
  const dataType = getDataType(data);

  const renderCollapsible = (isArray: boolean) => {
    const items = isArray ? (data as JSONValue[]) : Object.entries(data as Record<string, JSONValue>);
    const itemCount = items.length;
    const isEmpty = itemCount === 0;

    const symbolMap = {
      open: isArray ? '[' : '{',
      close: isArray ? ']' : '}',
      collapsed: isArray ? '[ ... ]' : '{ ... }',
      empty: isArray ? '[]' : '{}',
    };

    if (isEmpty) {
      return (
        <div className="flex items-center">
          {name && <span className="mr-1 text-gray-600 dark:text-gray-400">{name}:</span>}
          <span className="text-gray-500">{symbolMap.empty}</span>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        <button
          className="flex items-center mr-1 rounded cursor-pointer group hover:bg-gray-800/10 dark:hover:bg-gray-800/20 bg-transparent border-none p-0 text-left w-full"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          {name && (
            <span className="mr-1 text-gray-600 dark:text-gray-400 dark:group-hover:text-gray-100 group-hover:text-gray-400">
              {name}:
            </span>
          )}
          {isExpanded ? (
            <span className="text-gray-600 dark:text-gray-400 dark:group-hover:text-gray-100 group-hover:text-gray-400">
              {symbolMap.open}
            </span>
          ) : (
            <>
              <span className="text-gray-600 dark:group-hover:text-gray-100 group-hover:text-gray-400">
                {symbolMap.collapsed}
              </span>
              <span className="ml-1 text-gray-700 dark:group-hover:text-gray-100 group-hover:text-gray-400">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            </>
          )}
        </button>
        {isExpanded && (
          <>
            <div className="pl-2 ml-4 border-l border-gray-200 dark:border-gray-800">
              {isArray
                ? (items as JSONValue[]).map((item, index) => (
                    <div className="my-1" key={index}>
                      <JSONNode
                        data={item}
                        depth={depth + 1}
                        initialExpandDepth={initialExpandDepth}
                        name={`${index}`}
                      />
                    </div>
                  ))
                : (items as [string, JSONValue][]).map(([key, value]) => (
                    <div className="my-1" key={key}>
                      <JSONNode data={value} depth={depth + 1} initialExpandDepth={initialExpandDepth} name={key} />
                    </div>
                  ))}
            </div>
            <div className="text-gray-600 dark:text-gray-400">{symbolMap.close}</div>
          </>
        )}
      </div>
    );
  };

  const renderString = (value: string) => {
    const maxLength = 100;
    const isTooLong = value.length > maxLength;

    if (!isTooLong) {
      return (
        <div className="flex mr-1 rounded hover:bg-gray-800/20">
          {name && <span className="mr-1 text-gray-600 dark:text-gray-400">{name}:</span>}
          <pre className={clsx(isError ? typeStyleMap.error : typeStyleMap.string, 'break-all whitespace-pre-wrap')}>
            "{value}"
          </pre>
        </div>
      );
    }

    return (
      <div className="flex mr-1 rounded group hover:bg-gray-800/20">
        {name && (
          <span className="mr-1 text-gray-600 dark:text-gray-400 dark:group-hover:text-gray-100 group-hover:text-gray-400">
            {name}:
          </span>
        )}
        <button
          className={clsx(
            isError ? typeStyleMap.error : typeStyleMap.string,
            'cursor-pointer break-all whitespace-pre-wrap font-mono text-left bg-transparent border-none p-0 m-0 w-full'
          )}
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? 'Click to collapse' : 'Click to expand'}
          type="button"
        >
          {isExpanded ? `"${value}"` : `"${value.slice(0, maxLength)}..."`}
        </button>
      </div>
    );
  };

  switch (dataType) {
    case 'object':
    case 'array':
      return renderCollapsible(dataType === 'array');
    case 'string':
      return renderString(data as string);
    default:
      return (
        <div className="flex items-center mr-1 rounded hover:bg-gray-800/20">
          {name && <span className="mr-1 text-gray-600 dark:text-gray-400">{name}:</span>}
          <span className={typeStyleMap[dataType] || typeStyleMap.default}>
            {data === null ? 'null' : String(data)}
          </span>
        </div>
      );
  }
});

JSONNode.displayName = 'JSONNode';

export default JSONView;
