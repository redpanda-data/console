/** biome-ignore-all lint/suspicious/noArrayIndexKey: part of JsonNode implementation */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: part of JsonNode implementation */
import clsx from 'clsx';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { memo, useMemo, useState } from 'react';
import type { JsonValue } from './json-utils';
import { getDataType, tryParseJson } from './json-utils';

interface JsonViewProps {
  data: unknown;
  name?: string;
  initialExpandDepth?: number;
  className?: string;
  withCopyButton?: boolean;
  isError?: boolean;
}

const JsonView = memo(
  ({ data, name, initialExpandDepth = 3, className, withCopyButton = true, isError = false }: JsonViewProps) => {
    const normalizedData = useMemo(() => {
      return typeof data === 'string' ? (tryParseJson(data).success ? tryParseJson(data).data : data) : data;
    }, [data]);

    const copyContent = useMemo(() => {
      return typeof normalizedData === 'string' ? normalizedData : JSON.stringify(normalizedData, null, 2);
    }, [normalizedData]);

    return (
      <div className={clsx('p-4 border rounded relative', className)}>
        {withCopyButton && (
          <CopyButton size="icon" variant="ghost" className="absolute top-2 right-2" content={copyContent} />
        )}
        <div className="font-mono text-sm transition-all duration-300">
          <JsonNode
            data={normalizedData as JsonValue}
            name={name}
            depth={0}
            initialExpandDepth={initialExpandDepth}
            isError={isError}
          />
        </div>
      </div>
    );
  },
);

JsonView.displayName = 'JsonView';

interface JsonNodeProps {
  data: JsonValue;
  name?: string;
  depth: number;
  initialExpandDepth: number;
  isError?: boolean;
}

const JsonNode = memo(({ data, name, depth = 0, initialExpandDepth, isError = false }: JsonNodeProps) => {
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
    const items = isArray ? (data as JsonValue[]) : Object.entries(data as Record<string, JsonValue>);
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
        {/** biome-ignore lint/a11y/noStaticElementInteractions: part of JsonNode implementation */}
        <div
          className="flex items-center mr-1 rounded cursor-pointer group hover:bg-gray-800/10 dark:hover:bg-gray-800/20"
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsExpanded(!isExpanded);
            }
          }}
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
        </div>
        {isExpanded && (
          <>
            <div className="pl-2 ml-4 border-l border-gray-200 dark:border-gray-800">
              {isArray
                ? (items as JsonValue[]).map((item, index) => (
                    <div key={index} className="my-1">
                      <JsonNode
                        data={item}
                        name={`${index}`}
                        depth={depth + 1}
                        initialExpandDepth={initialExpandDepth}
                      />
                    </div>
                  ))
                : (items as [string, JsonValue][]).map(([key, value]) => (
                    <div key={key} className="my-1">
                      <JsonNode data={value} name={key} depth={depth + 1} initialExpandDepth={initialExpandDepth} />
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
        <pre
          className={clsx(
            isError ? typeStyleMap.error : typeStyleMap.string,
            'cursor-pointer break-all whitespace-pre-wrap',
          )}
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? 'Click to collapse' : 'Click to expand'}
        >
          {isExpanded ? `"${value}"` : `"${value.slice(0, maxLength)}..."`}
        </pre>
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

JsonNode.displayName = 'JsonNode';

export default JsonView;
