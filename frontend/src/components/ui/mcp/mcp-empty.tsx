import { Button } from 'components/redpanda-ui/components/button';
import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { Text } from 'components/redpanda-ui/components/typography';
import { useNavigate } from 'react-router-dom';

type MCPEmptyProps = {
  children?: React.ReactNode;
};

export const MCPEmpty = ({ children }: MCPEmptyProps) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-muted border-dashed bg-muted/10 py-12">
      <MCPIcon className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
      <Text className="mb-2 font-medium" variant="default">
        No MCP Servers Available
      </Text>
      {children}
      <Button onClick={() => navigate('/mcp-servers/create')} size="sm" variant="outline">
        Create MCP Server
      </Button>
    </div>
  );
};
