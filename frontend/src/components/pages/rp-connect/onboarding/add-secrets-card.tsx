import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertCircle, Check, ChevronDown, PlusIcon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useMemo, useState } from 'react';

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
  const [isOpen, setIsOpen] = useState(false);
  const detectedSecretsSet = useMemo(() => new Set(detectedSecrets), [detectedSecrets]);

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

  const { visibleSecrets, collapsibleSecrets, hasMore } = useMemo(() => {
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
      hasMore,
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Secrets</CardTitle>
        <CardDescription>Manage secret variables in your pipeline configuration.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {existingSecrets.length > 0 && (
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <div className="flex flex-col gap-2">
                <Text className="text-sm font-medium">Existing Secrets:</Text>
                <div className="flex flex-wrap gap-2">
                  {visibleSecrets.used.map((secret) => (
                    <Badge key={secret} variant="green" className="font-mono" icon={<Check />}>
                      {`\${secrets.${secret}}`}
                    </Badge>
                  ))}
                  {visibleSecrets.unused.map((secret) => (
                    <Badge
                      key={secret}
                      variant="secondary"
                      className="font-mono cursor-pointer hover:opacity-80"
                      onClick={() => handleSecretClick(secret)}
                    >
                      {`\${secrets.${secret}}`}
                    </Badge>
                  ))}
                  <CollapsibleContent className="flex flex-wrap gap-2">
                    {collapsibleSecrets.used.map((secret) => (
                      <Badge key={secret} variant="green" className="font-mono" icon={<Check />}>
                        {`\${secrets.${secret}}`}
                      </Badge>
                    ))}
                    {collapsibleSecrets.unused.map((secret) => (
                      <Badge
                        key={secret}
                        variant="secondary"
                        className="font-mono cursor-pointer hover:opacity-80"
                        onClick={() => handleSecretClick(secret)}
                      >
                        {`\${secrets.${secret}}`}
                      </Badge>
                    ))}
                  </CollapsibleContent>
                  {hasMore && (
                    <CollapsibleTrigger asChild>
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                        icon={<ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />}
                      >
                        {isOpen ? 'Hide' : `${existingSecrets.length - 3} More`}
                      </Badge>
                    </CollapsibleTrigger>
                  )}
                </div>
              </div>
            </Collapsible>
          )}
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
          {existingSecrets.length === 0 && detectedSecrets.length === 0 && (
            <Text className="text-muted-foreground text-sm">
              Your pipeline doesn't reference any secrets yet. Use <code>$&#123;secrets.NAME&#125;</code> syntax to
              reference secrets.
            </Text>
          )}
          <Button variant="outline" size={existingSecrets.length > 0 ? 'sm' : 'default'} onClick={onOpenDialog}>
            <PlusIcon className="h-4 w-4" />
            {existingSecrets.length > 0 ? 'Add More Secrets' : 'Add Secret'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
