import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import type { ReactNode } from 'react';

type StepSurfaceProps = {
  /** Renders the form bare (no Card chrome/min-height/margin) so it can sit inside a host surface like a dialog body. */
  inline: boolean;
  className?: string;
  hideTitle?: boolean;
  title: string;
  description: ReactNode;
  children: ReactNode;
};

/** The surface an onboarding step's form sits on: bare when inline, otherwise the wizard's titled card. */
export function StepSurface({ inline, className, hideTitle, title, description, children }: StepSurfaceProps) {
  if (inline) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Card className={className} size="full" variant="ghost">
      {!hideTitle && (
        <CardHeader className="max-w-2xl">
          <CardTitle>
            <h2 className="text-heading-lg">{title}</h2>
          </CardTitle>
          <CardDescription className="mt-4">{description}</CardDescription>
        </CardHeader>
      )}
      <CardContent className="min-h-[300px]">{children}</CardContent>
    </Card>
  );
}
