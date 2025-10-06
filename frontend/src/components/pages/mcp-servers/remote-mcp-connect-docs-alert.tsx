import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Link } from 'components/redpanda-ui/components/typography';
import { ExternalLink, Info } from 'lucide-react';

interface RemoteMCPConnectDocsAlertProps {
  documentationUrl: string;
  clientName: string;
}

export const RemoteMCPConnectDocsAlert = ({ documentationUrl, clientName }: RemoteMCPConnectDocsAlertProps) => {
  return (
    <Alert variant="default">
      <Info />
      <AlertTitle>{clientName} documentation</AlertTitle>
      <AlertDescription>
        <div className="flex flex-wrap items-center gap-1">
          <span>Read the documentation for {clientName}</span>
          <Link
            href={documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
          >
            here <ExternalLink className="h-3 w-3" />
          </Link>
          <span>to learn how to connect to the MCP server.</span>
        </div>
      </AlertDescription>
    </Alert>
  );
};
