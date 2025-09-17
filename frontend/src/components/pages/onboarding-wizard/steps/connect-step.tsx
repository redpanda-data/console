import { Markdown } from '@redpanda-data/ui';
import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import downdoc from 'downdoc';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGetConnectContentQuery } from 'react-query/api/connect-docs';
import useOnboardingWizardStore, { useAddDataFormData } from '../../../../state/onboarding-wizard/state';
import type { ConnectionType } from '../utils/connect';

export const ConnectStep = ({ additionalConnections }: { additionalConnections?: ConnectionType[] }) => {
  const { regenerateAndSaveConfig, connectConfig } = useOnboardingWizardStore();

  useEffect(() => {
    regenerateAndSaveConfig();
  }, [regenerateAndSaveConfig]);

  return (
    <div className="flex flex-col gap-8">
      <Card size="full">
        <CardHeader>
          <Heading level={2}>You're all set!</Heading>
        </CardHeader>
        <CardContent>Click finish to fine tune your RPCN configuration. </CardContent>
        {/* summary of everything we did */}
        {connectConfig?.yaml ? (
          <DynamicCodeBlock lang="yaml" code={connectConfig.yaml} />
        ) : (
          <Text color="destructive">Something went wrong, start the wizard over again.</Text>
        )}
      </Card>
      <ConnectDocs additionalConnections={additionalConnections} />
    </div>
  );
};

export const ConnectDocs = ({ additionalConnections }: { additionalConnections?: ConnectionType[] }) => {
  const { data: { connection: connectionData } = {} } = useAddDataFormData();

  // Check if this connection matches one from additionalConnections
  const additionalConnection = useMemo(
    () => additionalConnections?.find((conn) => conn.name === connectionData),
    [additionalConnections, connectionData],
  );

  if (!connectionData) {
    return <Text variant="lead">Something went wrong, start the wizard over again.</Text>;
  }

  if (additionalConnection) {
    return <ConnectByAdditionalConnection connection={additionalConnection} />;
  }

  return <ConnectByConnect connection={connectionData} />;
};

const ConnectByConnect = ({ connection }: { connection: string }) => {
  const { connectConfig } = useOnboardingWizardStore();
  const connectionType = connectConfig?.type === 'input' ? 'input' : 'output';
  const {
    pageContent,
    partialContent,
    isLoading: isCodeSnippetLoading,
  } = useGetConnectContentQuery({
    connection,
    connectionType,
  });

  const connectionTypeLabel = connectConfig?.type === 'input' ? 'Input' : 'Output';

  // TODO: migrate to asciidoctor or antora
  const formattedPageContent = pageContent ? downdoc(pageContent) : '';
  const formattedPartialContent = partialContent ? downdoc(partialContent) : '';

  return (
    <div className="flex flex-col gap-8">
      <Heading level={2}>{connection} Docs</Heading>

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

// Custom hook to fetch external documentation
const useExternalDocumentation = (url?: string, format?: 'markdown' | 'asciidoc') => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    if (!url) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch documentation: ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      setContent(text);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to fetch external documentation:', err);
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const formattedContent = useMemo(() => {
    if (!content) return '';

    // Handle different formats - for now just handle markdown/asciidoc with downdoc
    if (format === 'asciidoc' || format === 'markdown') {
      return downdoc(content);
    }

    return content;
  }, [content, format]);

  return { content: formattedContent, isLoading, error, refetch: fetchContent };
};

const ConnectByAdditionalConnection = ({ connection }: { connection: ConnectionType }) => {
  const { connectConfig } = useOnboardingWizardStore();
  const connectionTypeLabel = connectConfig?.type === 'input' ? 'Input' : 'Output';

  const {
    content: primaryContent,
    isLoading: isPrimaryLoading,
    error: primaryError,
  } = useExternalDocumentation(connection.docUrl, connection.docFormat);

  const {
    content: secondaryContent,
    isLoading: isSecondaryLoading,
    error: secondaryError,
  } = useExternalDocumentation(connection.docUrl2, connection.docFormat);

  const isLoading = isPrimaryLoading || isSecondaryLoading;
  const hasError = primaryError || secondaryError;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col">
        <Heading className="gap-2 flex items-center" level={2}>
          {connection.src && (
            <img
              src={connection.src}
              alt={`${connection.name} logo`}
              className="w-12 h-12 object-contain"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          {connection.name} Docs
        </Heading>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : hasError ? (
        <Card size="full">
          <CardContent className="text-center py-8">
            <Text variant="muted">Unable to load documentation. Please check the connection URLs.</Text>
            {(primaryError || secondaryError) && (
              <Text variant="muted" className="mt-2 text-sm">
                Error: {primaryError || secondaryError}
              </Text>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Primary documentation */}
          {primaryContent && (
            <div>
              <Heading level={3} className="mb-4">
                {connectionTypeLabel} Documentation
              </Heading>
              <Markdown theme="dark" showLineNumbers showCopyButton>
                {primaryContent}
              </Markdown>
            </div>
          )}

          {/* Secondary documentation */}
          {secondaryContent && (
            <div>
              <Heading level={3} className="mb-4">
                {connectionTypeLabel} Configuration
              </Heading>
              <Markdown theme="dark" showLineNumbers showCopyButton>
                {secondaryContent}
              </Markdown>
            </div>
          )}

          {/* Fallback if no content is available */}
          {!primaryContent && !secondaryContent && (
            <Card size="full">
              <CardContent className="text-center py-8">
                <Text variant="muted">No documentation content available for this connection.</Text>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
