import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { Check, ChevronDown, PlusIcon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useMemo, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';

import { AddSecretsDialog } from './add-secrets-dialog';

export const AddSecretsCard = ({
  editorContent,
  editorInstance,
}: {
  editorContent: string;
  editorInstance: editor.IStandaloneCodeEditor | null;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);

  // Fetch secrets
  const { data: secretsResponse } = useListSecretsQuery({});
  const existingSecrets = useMemo(
    () => (secretsResponse?.secrets ? secretsResponse.secrets.map((s) => s?.id || '') : []),
    [secretsResponse]
  );

  // Detect secrets in editor content
  const detectedSecrets = useMemo(() => {
    if (!editorContent) {
      return [];
    }
    const references = extractSecretReferences(editorContent);
    return getUniqueSecretNames(references);
  }, [editorContent]);

  const detectedSecretsSet = useMemo(() => new Set(detectedSecrets), [detectedSecrets]);
  const existingSecretsSet = useMemo(() => new Set(existingSecrets), [existingSecrets]);
  const missingSecrets = useMemo(
    () => detectedSecrets.filter((secret) => !existingSecretsSet.has(secret)),
    [detectedSecrets, existingSecretsSet]
  );

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

  const { visibleSecrets, collapsibleSecrets, hasMoreSecrets } = useMemo(() => {
    const allSecrets = [...categorizedSecrets.used, ...categorizedSecrets.unused];
    const visible = allSecrets.slice(0, 3);
    const collapsible = allSecrets.slice(3);
    const hasMore = allSecrets.length > 3;

    const visibleUsed = visible.filter((s) => categorizedSecrets.used.includes(s));
    const visibleUnused = visible.filter((s) => categorizedSecrets.unused.includes(s));

    const collapsibleUsed = collapsible.filter((s) => categorizedSecrets.used.includes(s));
    const collapsibleUnused = collapsible.filter((s) => categorizedSecrets.unused.includes(s));

    return {
      visibleSecrets: { used: visibleUsed, unused: visibleUnused },
      collapsibleSecrets: { used: collapsibleUsed, unused: collapsibleUnused },
      hasMoreSecrets: hasMore,
    };
  }, [categorizedSecrets]);

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

  const handleUpdateEditorContent = useCallback(
    (oldName: string, newName: string) => {
      if (!editorInstance) {
        return;
      }

      const model = editorInstance.getModel();
      if (!model) {
        return;
      }

      // Find and replace all occurrences of ${secrets.oldName} with ${secrets.newName}
      const oldPattern = `\${secrets.${oldName}}`;
      const newPattern = `\${secrets.${newName}}`;
      const content = model.getValue();
      const updatedContent = content.replaceAll(oldPattern, newPattern);

      if (content !== updatedContent) {
        model.setValue(updatedContent);
      }
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
        <div className="flex flex-col gap-4">
          {existingSecrets.length > 0 && (
            <Collapsible onOpenChange={setIsOpen} open={isOpen}>
              <div className="flex flex-col gap-2">
                <Text className="font-medium text-sm">Existing secrets:</Text>
                <div className="flex flex-wrap gap-2">
                  {visibleSecrets.used.map((secret) => (
                    <Badge className="font-mono" icon={<Check />} key={secret} variant="success-inverted">
                      {`\${secrets.${secret}}`}
                    </Badge>
                  ))}
                  {visibleSecrets.unused.map((secret) => (
                    <Badge
                      className="cursor-pointer font-mono hover:opacity-80"
                      key={secret}
                      onClick={() => handleSecretClick(secret)}
                      variant="neutral-inverted"
                    >
                      {`\${secrets.${secret}}`}
                    </Badge>
                  ))}
                  <CollapsibleContent className="flex flex-wrap gap-2">
                    {collapsibleSecrets.used.map((secret) => (
                      <Badge className="font-mono" icon={<Check />} key={secret} variant="success-inverted">
                        {`\${secrets.${secret}}`}
                      </Badge>
                    ))}
                    {collapsibleSecrets.unused.map((secret) => (
                      <Badge
                        className="cursor-pointer font-mono hover:opacity-80"
                        key={secret}
                        onClick={() => handleSecretClick(secret)}
                        variant="neutral-inverted"
                      >
                        {`\${secrets.${secret}}`}
                      </Badge>
                    ))}
                  </CollapsibleContent>
                  {Boolean(hasMoreSecrets) && (
                    <CollapsibleTrigger asChild>
                      <Badge
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                        icon={<ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />}
                        variant="outline"
                      >
                        {isOpen ? 'Hide' : `${existingSecrets.length - 3} more`}
                      </Badge>
                    </CollapsibleTrigger>
                  )}
                </div>
              </div>
            </Collapsible>
          )}
          {missingSecrets.length > 0 && (
            <div className="flex flex-col gap-2">
              <Text className="text-destructive" variant="label">
                Missing secrets:
              </Text>
              <div className="flex flex-wrap gap-2">
                {missingSecrets.map((secret) => (
                  <Badge
                    className="cursor-pointer text-sm hover:opacity-80"
                    key={secret}
                    onClick={() => setIsSecretsDialogOpen(true)}
                    variant="destructive-inverted"
                  >
                    Create <InlineCode className="bg-transparent">$secrets.{secret}</InlineCode>
                    <PlusIcon className="size-4" />
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <Button
            onClick={() => setIsSecretsDialogOpen(true)}
            size={existingSecrets.length > 0 ? 'sm' : 'md'}
            variant="outline"
          >
            {existingSecrets.length > 0 ? 'Add more secrets' : 'Add secret'}
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      <AddSecretsDialog
        existingSecrets={existingSecrets}
        isOpen={isSecretsDialogOpen}
        missingSecrets={missingSecrets}
        onClose={() => setIsSecretsDialogOpen(false)}
        onSecretsCreated={() => setIsSecretsDialogOpen(false)}
        onUpdateEditorContent={handleUpdateEditorContent}
      />
    </Card>
  );
};
