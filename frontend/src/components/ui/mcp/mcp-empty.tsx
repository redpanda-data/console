import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { Text } from 'components/redpanda-ui/components/typography';

type MCPEmptyProps = {
	children?: React.ReactNode;
	"data-testid"?: string;
};

export const MCPEmpty = ({
	children,
	"data-testid": dataTestId,
}: MCPEmptyProps) => {
	return (
		<div
			className="flex flex-col items-center justify-center rounded-lg border-2 border-muted border-dashed bg-muted/10 py-12"
			data-testid={dataTestId}
		>
			<MCPIcon className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
			<Text className="mb-2 font-medium">No MCP Servers Available</Text>
			{children}
		</div>
	);
};
