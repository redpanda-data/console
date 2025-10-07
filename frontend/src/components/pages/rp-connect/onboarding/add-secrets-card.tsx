import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Check, PlusIcon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useMemo } from 'react';

export const AddSecretsCard = ({
  detectedSecrets,
  missingSecrets,
  existingSecrets,
  editorInstance,
  onOpenDialog,
}: {
  detectedSecrets: string[];
  missingSecrets: string[];
  existingSecrets: string[];
  editorInstance: editor.IStandaloneCodeEditor | null;
  onOpenDialog: () => void;
}) => {
  // Create a Set for O(1) lookup instead of O(n) array.includes()
  const detectedSecretsSet = useMemo(() => new Set(detectedSecrets), [detectedSecrets]);

  // Categorize secrets into used and unused for more efficient rendering
  const categorizedSecrets = useMemo(() => {
    const used: string[] = [];
    const unused: string[] = [];

    for (const secret of existingSecrets) {
      if (detectedSecretsSet.has(secret)) {
        used.push(secret);
      } else {
        unused.push(secret);
      }
    }

    return { used, unused };
  }, [existingSecrets, detectedSecretsSet]);

  // Memoize the click handler to prevent recreating on every render
  const handleSecretClick = useCallback(
    (secretName: string) => {
      if (!editorInstance) {
        return;
      }

      const position = editorInstance.getPosition();
      if (!position) {
        return;
      }

      editorInstance.executeEdits('insert-secret', [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: `\${secrets.${secretName}}`,
        },
      ]);

      editorInstance.focus();
    },
    [editorInstance]
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Secrets</CardTitle>
        <CardDescription>Manage secret variables in your pipeline configuration.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Existing secrets - always show if any exist */}
          {existingSecrets.length > 0 && (
            <div className="flex flex-col gap-2">
              <Text className="font-medium text-sm">Existing Secrets:</Text>
              <div className="flex flex-wrap gap-2">
                {/* Used secrets - green with check icon */}
                {categorizedSecrets.used.map((secret) => (
                  <Badge className="font-mono" icon={<Check />} key={secret} variant="green">
                    {`\${secrets.${secret}}`}
                  </Badge>
                ))}
                {/* Unused secrets - clickable, secondary variant */}
                {categorizedSecrets.unused.map((secret) => (
                  <Badge
                    className="cursor-pointer font-mono hover:opacity-80"
                    key={secret}
                    onClick={() => handleSecretClick(secret)}
                    variant="secondary"
                  >
                    {`\${secrets.${secret}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Missing secrets - show as buttons */}
          {missingSecrets.length > 0 && (
            <div className="flex flex-col gap-2">
              <Text className="font-medium text-destructive text-sm">Missing Secrets:</Text>
              <div className="flex flex-wrap gap-2">
                {missingSecrets.map((secret) => (
                  <Button key={secret} onClick={onOpenDialog} size="sm" variant="destructive">
                    <AlertCircle className="h-3 w-3" />
                    Create {secret}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* No secrets hint - show only when no existing secrets */}
          {existingSecrets.length === 0 && detectedSecrets.length === 0 && (
            <Text className="text-muted-foreground text-sm">
              Your pipeline doesn't reference any secrets yet. Use <code>$&#123;secrets.NAME&#125;</code> syntax to
              reference secrets.
            </Text>
          )}

          {/* Add button - always show */}
          <Button onClick={onOpenDialog} size={existingSecrets.length > 0 ? 'sm' : 'default'} variant="outline">
            <PlusIcon className="h-4 w-4" />
            {existingSecrets.length > 0 ? 'Add More Secrets' : 'Add Secret'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
