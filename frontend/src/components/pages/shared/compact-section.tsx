import { Card, type CardProps } from 'components/redpanda-ui/components/card';

type CompactSectionProps = Pick<CardProps, 'children' | 'id'>;

/**
 * The legacy page `Section` with tighter vertical padding. The small card size carries Section's
 * `px-6` and the compact `py-4`; `max-w-none` lifts its width cap so the card still fills the column.
 */
export function CompactSection({ children, id }: CompactSectionProps) {
  return (
    <Card className="block max-w-none" id={id} size="sm">
      {children}
    </Card>
  );
}
