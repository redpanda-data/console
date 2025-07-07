import { COMPONENT_TYPE, type FieldSpec } from './types';
import { ScalarInput } from './scalar-input';
import { MapInput } from './map-input';
import { TwoDArrayInput } from './twod-array-input';
import { ArrayInput } from './array-input';
import { FormFieldWrapper } from './form-field-wrapper';
import { Input } from '@/components/redpanda-ui/input';

type FieldRendererProps = {
  path: string;
  spec: FieldSpec;
};

export const FieldRenderer: React.FC<FieldRendererProps> = ({ path, spec }) => {
    // 1. Handle special component type selectors (e.g. other inputs / outputs etc)
    if ((COMPONENT_TYPE as readonly string[]).includes(spec.type)) {
        return null;
    }

    // 2. Handle structural kinds
    switch (spec.kind) {
        case 'scalar':
            return <ScalarInput path={path} spec={spec} />
        case 'map':
            return <MapInput path={path} spec={spec} />;
        case 'array':
            return <ArrayInput path={path} spec={spec} />;
        case '2darray':
            return <TwoDArrayInput path={path} spec={spec} />;
        default:
            // Must be some unknown / new kind that we haven't handled yet.
            // Render a disabled input for unknown kinds as a fallback.
            return (
                <FormFieldWrapper spec={spec}>
                    <Input disabled value={`Unknown field kind: ${spec.kind}`} />
                </FormFieldWrapper>
            );
    }
}
