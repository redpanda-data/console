import type { FieldSpec } from '@/components/node-editor/redpanda-connect/types';
import { useAppStore } from '@/components/node-editor/store';
import { Button } from '@/components/redpanda-ui/button';
import { Form } from '@/components/redpanda-ui/form';
import { useEffect } from 'react';
import { type FieldValues, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { FieldRenderer } from './field-renderer';

interface ConfigFormProps {
  root: FieldSpec;
  basePath?: string; // '' for top level
  nodeId?: string;
}

export const ConfigForm: React.FC<ConfigFormProps> = ({ root, basePath = '', nodeId }) => {
  const fields = Array.isArray(root.children) ? root.children : [root];
  const form = useForm();
  const { saveNodeConfig, getNodeConfig } = useAppStore(
    useShallow((state) => ({
      saveNodeConfig: state.saveNodeConfig,
      getNodeConfig: state.getNodeConfig,
    })),
  );

  // Load saved data when component mounts or nodeId changes
  useEffect(() => {
    if (nodeId) {
      const savedData = getNodeConfig(nodeId);
      if (savedData) {
        form.reset(savedData);
      }
    }
  }, [nodeId, getNodeConfig, form]);

  function onSubmit(data: FieldValues) {
    if (nodeId) {
      saveNodeConfig(nodeId, data);
      toast('You saved the following values:', {
        description: (
          <pre className="mt-2 w-[320px] rounded-md bg-neutral-950 p-4">
            <code className="text-white">{JSON.stringify(data, null, 2)}</code>
          </pre>
        ),
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {fields.map((f, _) => {
          const path = basePath ? `${basePath}.${f.name}` : f.name;

          return (
            <>
              <FieldRenderer key={path} path={path} spec={f} />
            </>
          );
        })}
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
};
