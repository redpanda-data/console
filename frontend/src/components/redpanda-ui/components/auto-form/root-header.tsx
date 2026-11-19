interface AutoFormRootHeaderProps {
  description?: string | undefined;
  testId: string;
  title?: string | undefined;
}

export function AutoFormRootHeader({ title, description, testId }: AutoFormRootHeaderProps) {
  const hasTitle = title !== undefined && title !== '';
  const hasDescription = description !== undefined && description !== '';
  if (!(hasTitle || hasDescription)) {
    return null;
  }
  return (
    <header className="space-y-1 border-b border-border-subtle pb-4" data-testid={testId}>
      {hasTitle ? <h2 className="text-heading-lg">{title}</h2> : null}
      {hasDescription ? <div className="text-body-sm text-subtle">{description}</div> : null}
    </header>
  );
}
