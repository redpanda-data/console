import { FieldRenderer } from './field-renderer';
import { FieldSpec } from './types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/redpanda-ui/card';

export const ObjectInput: React.FC<{ path: string; spec: FieldSpec }> = ({ path, spec }) => {
  if (!spec.children) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.name}</CardTitle>
        {spec.description && (
          <CardDescription>{spec.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {spec.children.map((childSpec) => (
          <FieldRenderer
            key={childSpec.name}
            path={`${path}.${childSpec.name}`}
            spec={childSpec}
          />
        ))}
      </CardContent>
    </Card>
  );
};
