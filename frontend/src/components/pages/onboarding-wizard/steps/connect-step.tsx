import { Markdown } from '@redpanda-data/ui';
import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import downdoc from 'downdoc';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGetConnectContentQuery } from 'react-query/api/connect-docs';
import { useConnectConfig } from '../../../../state/onboarding-wizard/state';
import type { ConnectComponentType, ExtendedConnectComponentSpec } from '../types/connect';
import { getComponentByName } from '../utils/connect';

// Helper function to get component type display label
const getComponentTypeLabel = (type: ConnectComponentType | undefined): string => {
  if (!type) return 'Component';
  return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
};

export const ConnectStep = ({ additionalComponents }: { additionalComponents?: ExtendedConnectComponentSpec[] }) => {
  const { data: connectConfig } = useConnectConfig();
  const connectionName = connectConfig?.connectionName;

  // Check if this connection matches one from additionalComponents
  const additionalComponent = useMemo(() => {
    if (additionalComponents) {
      return additionalComponents.find((comp) => comp.name === connectionName);
    }
    return undefined;
  }, [additionalComponents, connectionName]);

  if (!connectionName) {
    return <Text variant="lead">Something went wrong, start the wizard over again.</Text>;
  }

  return additionalComponent ? (
    <ConnectByExtendedComponent component={additionalComponent} />
  ) : (
    <ConnectByConnect additionalComponents={additionalComponents} />
  );
};

const ConnectByConnect = ({ additionalComponents }: { additionalComponents?: ExtendedConnectComponentSpec[] } = {}) => {
  const { data: connectConfig } = useConnectConfig();
  const connectionName = connectConfig?.connectionName;
  const componentConfig = getComponentByName(connectionName, additionalComponents);
  const {
    pageContent,
    partialContent,
    isLoading: isCodeSnippetLoading,
  } = useGetConnectContentQuery({
    connectionName: connectionName ?? '',
    connectionType: componentConfig?.type as ConnectComponentType,
  });

  const connectionTypeLabel = getComponentTypeLabel(componentConfig?.type);

  // TODO: migrate to asciidoctor or antora
  const formattedPageContent = pageContent ? downdoc(pageContent) : '';
  const formattedPartialContent = partialContent ? downdoc(partialContent) : '';

  return (
    <div className="flex flex-col gap-8">
      <Card size="full">
        <CardHeader>
          <Heading level={2}>You're almost there</Heading>
        </CardHeader>
        <CardContent>Add any additional configurations to the yaml config I've generated for you.</CardContent>
      </Card>
      <Heading level={2}>{connectionName} Docs</Heading>

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

// Guidance card for external components
const ExternalSetupGuidanceCard = () => {
  return (
    <Card size="full">
      <CardHeader>
        <Heading level={3}>Next Steps</Heading>
      </CardHeader>
      <CardContent>
        <Text>
          Complete your setup to start streaming data to your Redpanda cluster using the Kafka API. Follow the
          documentation below to configure your connection and begin processing data.
        </Text>
      </CardContent>
    </Card>
  );
};

const ConnectByExtendedComponent = ({ component }: { component: ExtendedConnectComponentSpec }) => {
  const connectionTypeLabel = getComponentTypeLabel(component.type);

  const {
    content: primaryContent,
    isLoading: isPrimaryLoading,
    error: primaryError,
  } = useExternalDocumentation(component.externalDocs?.primaryUrl, component.externalDocs?.format);

  const {
    content: secondaryContent,
    isLoading: isSecondaryLoading,
    error: secondaryError,
  } = useExternalDocumentation(component.externalDocs?.secondaryUrl, component.externalDocs?.format);

  const isLoading = isPrimaryLoading || isSecondaryLoading;
  const hasError = primaryError || secondaryError;

  return (
    <div className="flex flex-col gap-8">
      <ExternalSetupGuidanceCard />
      <div className="flex flex-col">
        <Heading className="gap-2 flex items-center" level={2}>
          {component.externalDocs?.logoUrl && (
            <img
              src={component.externalDocs.logoUrl}
              alt={`${component.name} logo`}
              className="w-12 h-12 object-contain"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          {component.name} Documentation
        </Heading>
        {component.summary && (
          <Text variant="muted" className="mt-2">
            {component.summary}
          </Text>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : hasError ? (
        <Card size="full">
          <CardContent className="text-center py-8">
            <Text variant="muted">Unable to load documentation. Please check the external documentation URLs.</Text>
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
                <Text variant="muted">No external documentation content available for this connection.</Text>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
