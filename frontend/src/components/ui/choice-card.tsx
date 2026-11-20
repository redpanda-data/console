import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from 'components/redpanda-ui/components/field';
import { RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import { type ReactNode, useId } from 'react';

type ChoiceCardProps = {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  /** Below the description, inside the card's text. */
  children?: ReactNode;
  /** Between the text and an end radio, e.g. a badge. */
  addon?: ReactNode;
  radioPosition?: 'start' | 'end';
  className?: string;
  testId?: string;
};

/** One selectable card in a `RadioGroup`: the registry's Field choice-card recipe. */
export function ChoiceCard({
  value,
  title,
  description,
  children,
  addon,
  radioPosition = 'end',
  className,
  testId,
}: ChoiceCardProps) {
  const id = useId();
  const radio = <RadioGroupItem id={id} value={value} />;
  return (
    <FieldLabel className={className} htmlFor={id} testId={testId}>
      <Field orientation="horizontal">
        {radioPosition === 'start' ? radio : null}
        <FieldContent>
          <FieldTitle>{title}</FieldTitle>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          {children}
        </FieldContent>
        {addon}
        {radioPosition === 'end' ? radio : null}
      </Field>
    </FieldLabel>
  );
}
