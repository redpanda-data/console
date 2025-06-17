import type { ComponentSpec, ComponentStatus } from '@/components/node-editor/redpanda-connect/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/redpanda-ui/accordion';
import { Badge } from '@/components/redpanda-ui/badge';
import { Card, CardContent } from '@/components/redpanda-ui/card';
import { ConfigForm } from './config-form';

/**
 * Map a ComponentStatus string literal to badge colour classes.
 */
const statusClasses = (status?: ComponentStatus) => {
  switch (status) {
    case 'stable':
      return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400';
    case 'beta':
      return 'bg-orange-500/20 text-orange-600 dark:text-orange-400';
    case 'experimental':
      return 'bg-red-500/20 text-red-600 dark:text-red-400';
    case 'deprecated':
      return 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-400';
    default:
      return 'bg-neutral-300/20 text-neutral-600 dark:text-neutral-400';
  }
};

const ComponentItem: React.FC<{ spec: ComponentSpec }> = ({ spec }) => (
  <AccordionItem value={spec.name} className="border-b">
    <AccordionTrigger className="py-4 [&[data-state=open]>svg]:rotate-180">
      <div className="flex items-center gap-2">
        <span className="font-medium">{spec.name}</span>
        {spec.status && <Badge className={statusClasses(spec.status)}>{spec.status}</Badge>}
      </div>
    </AccordionTrigger>
    <AccordionContent>
      <Card className="mt-4">
        <CardContent className="space-y-6 pt-6">
          {spec.summary && <p className="text-sm">{spec.summary}</p>}
          {spec.version && <p className="text-xs text-muted-foreground">Since {spec.version}</p>}
          {spec.categories && (
            <div className="flex flex-wrap gap-2 pt-2">
              {spec.categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          )}
          <ConfigForm root={spec.config} />
        </CardContent>
      </Card>
    </AccordionContent>
  </AccordionItem>
);

const Section: React.FC<{ title: string; components?: ComponentSpec[] }> = ({ title, components }) => (
  <section className="mb-10">
    <h3 className="text-xl font-semibold mb-4">{title}</h3>

    {components?.length ? (
      <Accordion type="multiple" className="w-full">
        {components.map((c) => (
          <ComponentItem key={c.name} spec={c} />
        ))}
      </Accordion>
    ) : (
      <p>No {title.toLowerCase()} components found in the schema.</p>
    )}
  </section>
);

export interface ComponentOverviewProps {
  inputs?: ComponentSpec[];
  outputs?: ComponentSpec[];
}

export const ComponentOverview: React.FC<ComponentOverviewProps> = ({ inputs, outputs }) => (
  <div className="max-w-4xl mx-auto">
    <h2 className="text-2xl font-bold mb-6">Redpanda Connect Components</h2>
    <Section title="Inputs" components={inputs} />
    <Section title="Outputs" components={outputs} />
  </div>
);
