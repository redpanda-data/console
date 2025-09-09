import { Text } from 'components/redpanda-ui/components/typography';
import { ExternalLink } from 'lucide-react';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';

interface RemoteMCPComponentTypeDescriptionProps {
  componentType?: MCPServer_Tool_ComponentType;
  className?: string;
}

export const RemoteMCPComponentTypeDescription = ({
  componentType,
  className = 'text-muted-foreground',
}: RemoteMCPComponentTypeDescriptionProps) => {
  return (
    <Text variant="small" className={className}>
      {componentType === MCPServer_Tool_ComponentType.PROCESSOR
        ? 'Functions that transform, filter, or manipulate messages as they pass through the pipeline.'
        : componentType === MCPServer_Tool_ComponentType.CACHE
          ? 'Key/value stores used for data deduplication, joins, and temporary storage.'
          : 'Choose the type of component this tool will use.'}{' '}
      {componentType !== undefined && (
        <a
          href={
            componentType === MCPServer_Tool_ComponentType.PROCESSOR
              ? 'https://docs.redpanda.com/redpanda-connect/components/processors/about/'
              : 'https://docs.redpanda.com/redpanda-connect/components/caches/about/'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
        >
          Learn more <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </Text>
  );
};
