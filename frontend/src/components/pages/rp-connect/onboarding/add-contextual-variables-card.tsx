import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Check, ChevronDown } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useMemo, useState } from 'react';

import { getContextualVariableSyntax, REDPANDA_CONTEXTUAL_VARIABLES } from '../types/constants';

/**
 * Detects contextual variables used in YAML content
 * Matches patterns like ${REDPANDA_BROKERS}, ${REDPANDA_SCHEMA_REGISTRY_URL}
 */
const detectContextualVariables = (content: string): Set<string> => {
  const pattern = /\$\{(REDPANDA_[A-Z_]+)\}/g;
  const matches = content.matchAll(pattern);
  const detected = new Set<string>();

  for (const match of matches) {
    if (match[1]) {
      detected.add(match[1]);
    }
  }

  return detected;
};

export const AddContextualVariablesCard = ({
  editorInstance,
  editorContent,
}: {
  editorInstance: editor.IStandaloneCodeEditor | null;
  editorContent: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const detectedVariables = useMemo(() => detectContextualVariables(editorContent), [editorContent]);

  const allVariables = useMemo(() => Object.values(REDPANDA_CONTEXTUAL_VARIABLES).map((v) => v.name), []);

  const categorizedVariables = useMemo(() => {
    const used: Array<{ name: string; description: string }> = [];
    const available: Array<{ name: string; description: string }> = [];

    for (const variable of Object.values(REDPANDA_CONTEXTUAL_VARIABLES)) {
      if (detectedVariables.has(variable.name)) {
        used.push({ name: variable.name, description: variable.description });
      } else {
        available.push({ name: variable.name, description: variable.description });
      }
    }

    return { used, available };
  }, [detectedVariables]);

  const { visibleVariables, collapsibleVariables, hasMoreVariables } = useMemo(() => {
    const allVars = [...categorizedVariables.used, ...categorizedVariables.available];
    const visible = allVars.slice(0, 3);
    const collapsible = allVars.slice(3);
    const hasMore = allVars.length > 3;

    const visibleUsed = visible.filter((v) => categorizedVariables.used.some((u) => u.name === v.name));
    const visibleAvailable = visible.filter((v) => categorizedVariables.available.some((a) => a.name === v.name));

    const collapsibleUsed = collapsible.filter((v) => categorizedVariables.used.some((u) => u.name === v.name));
    const collapsibleAvailable = collapsible.filter((v) =>
      categorizedVariables.available.some((a) => a.name === v.name)
    );

    return {
      visibleVariables: { used: visibleUsed, available: visibleAvailable },
      collapsibleVariables: { used: collapsibleUsed, available: collapsibleAvailable },
      hasMoreVariables: hasMore,
    };
  }, [categorizedVariables]);

  const handleVariableClick = useCallback(
    (variableName: string) => {
      if (!editorInstance) {
        return;
      }

      const position = editorInstance.getPosition();
      if (!position) {
        return;
      }

      const variableSyntax = getContextualVariableSyntax(variableName as keyof typeof REDPANDA_CONTEXTUAL_VARIABLES);

      editorInstance.executeEdits('insert-contextual-variable', [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: variableSyntax,
        },
      ]);

      editorInstance.focus();
    },
    [editorInstance]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contextual variables</CardTitle>
        <CardDescription>
          Predefined variables automatically available in your Redpanda Cloud environment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {allVariables.length > 0 && (
            <Collapsible onOpenChange={setIsOpen} open={isOpen}>
              <div className="flex flex-col gap-2">
                <Text className="font-medium text-sm">Available Variables:</Text>
                <div className="flex flex-wrap gap-2">
                  {visibleVariables.used.map((variable) => (
                    <Badge
                      className="font-mono"
                      icon={<Check />}
                      key={variable.name}
                      title={variable.description}
                      variant="green"
                    >
                      {getContextualVariableSyntax(variable.name as keyof typeof REDPANDA_CONTEXTUAL_VARIABLES)}
                    </Badge>
                  ))}
                  {visibleVariables.available.map((variable) => (
                    <Badge
                      className="cursor-pointer font-mono hover:opacity-80"
                      key={variable.name}
                      onClick={() => handleVariableClick(variable.name)}
                      title={variable.description}
                      variant="secondary"
                    >
                      {getContextualVariableSyntax(variable.name as keyof typeof REDPANDA_CONTEXTUAL_VARIABLES)}
                    </Badge>
                  ))}
                  <CollapsibleContent className="flex flex-wrap gap-2">
                    {collapsibleVariables.used.map((variable) => (
                      <Badge
                        className="font-mono"
                        icon={<Check />}
                        key={variable.name}
                        title={variable.description}
                        variant="green"
                      >
                        {getContextualVariableSyntax(variable.name as keyof typeof REDPANDA_CONTEXTUAL_VARIABLES)}
                      </Badge>
                    ))}
                    {collapsibleVariables.available.map((variable) => (
                      <Badge
                        className="cursor-pointer font-mono hover:opacity-80"
                        key={variable.name}
                        onClick={() => handleVariableClick(variable.name)}
                        title={variable.description}
                        variant="secondary"
                      >
                        {getContextualVariableSyntax(variable.name as keyof typeof REDPANDA_CONTEXTUAL_VARIABLES)}
                      </Badge>
                    ))}
                  </CollapsibleContent>
                  {hasMoreVariables && (
                    <CollapsibleTrigger asChild>
                      <Badge
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                        icon={<ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />}
                        variant="outline"
                      >
                        {isOpen ? 'Hide' : `${allVariables.length - 3} More`}
                      </Badge>
                    </CollapsibleTrigger>
                  )}
                </div>
              </div>
            </Collapsible>
          )}

          <Text className="text-muted-foreground text-sm">
            Click a variable to insert it at your cursor position. These variables are automatically resolved at
            runtime.
          </Text>
        </div>
      </CardContent>
    </Card>
  );
};
