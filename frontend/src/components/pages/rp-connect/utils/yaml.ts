import { configToYaml, getAllComponents, mergeConnectConfigs, schemaToConfig } from './schemaParsers';

/**
 * generates a yaml string for a connect config based on the selected connectionName and connectionType
 * @param existingYaml - optional existing YAML content to merge with
 * @returns yaml string of connect config for the selected connectionName and connectionType
 */

export const getConnectTemplate = ({
  connectionName,
  connectionType,
  showOptionalFields,
  existingYaml,
}: {
  connectionName: string;
  connectionType: string;
  showOptionalFields?: boolean;
  existingYaml?: string;
}) => {
  const componentSpec =
    connectionName && connectionType
      ? getAllComponents().find((comp) => comp.type === connectionType && comp.name === connectionName)
      : undefined;

  if (!componentSpec) {
    return undefined;
  }

  // Phase 1: Generate config object for new component
  const newConfigObject = schemaToConfig(componentSpec, showOptionalFields);
  if (!newConfigObject) {
    return undefined;
  }

  // Phase 2 & 3: Merge with existing (if any) and convert to YAML
  if (existingYaml) {
    const mergedConfig = mergeConnectConfigs(existingYaml, newConfigObject, componentSpec);
    return configToYaml(mergedConfig, componentSpec);
  }

  return configToYaml(newConfigObject, componentSpec);
};
