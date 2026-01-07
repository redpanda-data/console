import { Link, Text } from 'components/redpanda-ui/components/typography';
import { ExternalLink } from 'lucide-react';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';

type RemoteMCPComponentTypeDescriptionProps = {
  componentType?: MCPServer_Tool_ComponentType;
  className?: string;
};

const getComponentTypeDescription = (componentType: MCPServer_Tool_ComponentType) => {
  switch (componentType) {
    case MCPServer_Tool_ComponentType.PROCESSOR:
      return 'Processor is a function that transforms, filters, or manipulates messages as they pass through the pipeline.';
    case MCPServer_Tool_ComponentType.CACHE:
      return 'Cache is a key/value store used for data deduplication, joins, and temporary storage.';
    case MCPServer_Tool_ComponentType.INPUT:
      return 'Input is the source of data piped through an array of optional processors.';
    case MCPServer_Tool_ComponentType.OUTPUT:
      return 'Output is a sink where you may wish to send consumed data after applying optional processors.';
    default:
      return 'Unspecified';
  }
};

const getComponentTypeDocumentationUrl = (componentType: MCPServer_Tool_ComponentType) => {
  const url = 'https://docs.redpanda.com/redpanda-connect/components/';
  switch (componentType) {
    case MCPServer_Tool_ComponentType.PROCESSOR:
      return `${url}/processors/about/`;
    case MCPServer_Tool_ComponentType.CACHE:
      return `${url}/caches/about/`;
    case MCPServer_Tool_ComponentType.INPUT:
      return `${url}/inputs/about/`;
    case MCPServer_Tool_ComponentType.OUTPUT:
      return `${url}/outputs/about/`;
    default:
      return '';
  }
};

export const RemoteMCPComponentTypeDescription = ({ componentType }: RemoteMCPComponentTypeDescriptionProps) => (
  <Text variant="muted">
    {getComponentTypeDescription(componentType ?? MCPServer_Tool_ComponentType.UNSPECIFIED)}{' '}
    {componentType !== undefined && (
      <Link
        className="inline-flex items-center gap-1"
        href={getComponentTypeDocumentationUrl(componentType ?? MCPServer_Tool_ComponentType.UNSPECIFIED)}
        rel="noopener noreferrer"
        target="_blank"
      >
        Learn more <ExternalLink className="h-3 w-3" />
      </Link>
    )}
  </Text>
);
