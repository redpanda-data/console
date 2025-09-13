import { Markdown } from "@redpanda-data/ui";
import {
	Card,
	CardContent,
	CardHeader,
} from "components/redpanda-ui/components/card";
import { Skeleton } from "components/redpanda-ui/components/skeleton";
import { Heading, Text } from "components/redpanda-ui/components/typography";
import downdoc from "downdoc";
import { useGetConnectContentQuery } from "react-query/api/connect-docs";
import { useAddDataFormData } from "../../../../state/onboarding-wizard/state";
import type { DataType } from "../types";
import type { ConnectionType } from "../utils/connect";

export const ConnectStep = ({
	dataType,
	additionalConnections,
}: {
	dataType: DataType;
	additionalConnections?: ConnectionType[];
}) => {
	const { data: addDataFormData } = useAddDataFormData();
	const connectionData = addDataFormData?.connection;

	if (!connectionData) {
		return (
			<Text variant="lead">
				Something went wrong, start the wizard over again.
			</Text>
		);
	}

	// if (
	// 	languages
	// 		.map((language) => language.name)
	// 		.includes(connectionData as CodeSnippetLanguage)
	// ) {
	// 	return (
	// 		<ConnectByAPI
	// 			language={connectionData as CodeSnippetLanguage}
	// 			cluster={cluster}
	// 			dataType={dataType}
	// 		/>
	// 	);
	// }
	// TODO: redirect to connect route and continue step in console
	return <ConnectByConnect connection={connectionData} dataType={dataType} />;
};

// const ConnectByAPI = ({
// 	language,
// 	cluster,
// 	dataType,
// }: {
// 	language: CodeSnippetLanguage;
// 	cluster: ServerlessCluster;
// 	dataType: DataType;
// }) => {
// 	const bootstrapServerUrl = cluster?.kafkaApi?.seedBrokers.join(",") as string;
// 	const { data: codeSnippet, isLoading: isCodeSnippetLoading } =
// 		useGetCodeSnippetQuery({ language });

// 	const formattedCodeSnippet =
// 		codeSnippet?.replaceAll("<bootstrap-server-address>", bootstrapServerUrl) ??
// 		"";
// 	return (
// 		<div className="flex flex-col gap-8">
// 			<Card size="full">
// 				<CardHeader>
// 					<Heading level={2}>
// 						Use the Kafka API to{" "}
// 						{dataType === "source"
// 							? "send your data to"
// 							: "read your data from"}{" "}
// 						your cluster
// 					</Heading>
// 				</CardHeader>
// 				<CardContent>
// 					Since you've already added a topic, user, and permissions, you can
// 					skip most of these steps.
// 				</CardContent>
// 			</Card>
// 			{isCodeSnippetLoading ? (
// 				<div className="flex flex-col space-y-3">
// 					<Skeleton className="h-[125px] w-[250px] rounded-xl" />
// 					<div className="space-y-2">
// 						<Skeleton className="h-4 w-[250px]" />
// 						<Skeleton className="h-4 w-[200px]" />
// 					</div>
// 				</div>
// 			) : (
// 				<Markdown theme="dark" showLineNumbers showCopyButton>
// 					{formattedCodeSnippet}
// 				</Markdown>
// 			)}
// 		</div>
// 	);
// };

const ConnectByConnect = ({
	connection,
	dataType,
}: {
	connection: string;
	dataType: DataType;
}) => {
	const connectionType = dataType === "source" ? "input" : "output";
	const {
		pageContent,
		partialContent,
		isLoading: isCodeSnippetLoading,
	} = useGetConnectContentQuery({
		connection,
		connectionType,
	});

	const connectionTypeLabel = dataType === "source" ? "Input" : "Output";

	// TODO: migrate to asciidoctor or antora
	const formattedPageContent = pageContent ? downdoc(pageContent) : "";
	const formattedPartialContent = partialContent ? downdoc(partialContent) : "";

	return (
		<div className="flex flex-col gap-8">
			<Card size="full">
				<CardHeader>
					<Heading level={2}>
						Use Redpanda Connect to{" "}
						{dataType === "source"
							? "send your data to"
							: "read your data from"}{" "}
						your cluster
					</Heading>
				</CardHeader>
				<CardContent>
					Copy/paste the relevant code snippet into your Redpanda Connect
					configuration.
				</CardContent>
			</Card>

			{isCodeSnippetLoading ? (
				// TODO fix this
				<Skeleton className="h-[125px] w-[250px] rounded-xl" />
			) : (
				<div className="flex flex-col gap-6">
					{/* Page content (full documentation) */}
					{formattedPageContent && (
						<div>
							<Heading level={3} className="mb-4">
								{connectionTypeLabel} Documentation
							</Heading>
							<Markdown theme="dark" showLineNumbers showCopyButton>
								{formattedPageContent}
							</Markdown>
						</div>
					)}

					{/* Partial content (configuration snippet) */}
					{formattedPartialContent && (
						<div>
							<Heading level={3} className="mb-4">
								{connectionTypeLabel} Configuration
							</Heading>
							<Markdown theme="dark" showLineNumbers showCopyButton>
								{formattedPartialContent}
							</Markdown>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
