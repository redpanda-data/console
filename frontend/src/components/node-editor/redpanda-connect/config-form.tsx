import type { FieldSpec } from '@/components/node-editor/redpanda-connect/types';
import { FormProvider, useForm } from 'react-hook-form';
import { FieldInput } from './field-input';

interface ConfigFormProps {
  root: FieldSpec;
  basePath?: string; // '' for top level
}

export const ConfigForm: React.FC<ConfigFormProps> = ({ root, basePath = '' }) => {
  const fields = Array.isArray(root.children) ? root.children : [root];
  const methods = useForm();

  return fields.map((f) => {
    const path = basePath ? `${basePath}.${f.name}` : f.name;

    return (
      <FormProvider key={path} {...methods}>
        <FieldInput key={path} path={path} spec={f} />
      </FormProvider>
    );
  });
};
