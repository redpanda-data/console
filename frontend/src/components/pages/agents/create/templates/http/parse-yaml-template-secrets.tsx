import { Scalar, stringify } from 'yaml';

type YamlTemplate = Record<string, any>;
interface ParseYamlTemplateSecretsParams {
  yamlTemplates: Record<string, YamlTemplate>;
  envVars: Record<string, string>;
  secretMappings: Record<string, string>;
}

/**
 * Converts a topic name to a valid PostgreSQL table name
 * Follows PostgreSQL identifier naming rules:
 * - Starts with letter or underscore
 * - Contains only letters, numbers, and underscores
 * - Max length of 63 characters
 * - Lowercase for consistency
 */
export const toPostgresTableName = (originalString: string): string => {
  let validName = originalString.replace(/[^a-zA-Z0-9_]/g, '_');
  if (!/^[a-zA-Z_]/.test(validName)) {
    validName = `_${validName}`;
  }
  validName = validName.substring(0, 63);
  return validName.toLowerCase();
};

/**
 * Wraps glob pattern strings in double quotes to preserve their syntax
 */
const wrapGlobPattern = (value: string): string => {
  if (value === '**' || value.includes('/**') || value.includes('**/')) {
    return `"${value}"`;
  }
  return value;
};

/**
 * Processes one or more YAML templates by replacing environment variables with their values
 * and standardizing secret references using provided mappings
 */
export const parseYamlTemplateSecrets = ({
  yamlTemplates,
  envVars = {},
  secretMappings = {},
}: ParseYamlTemplateSecretsParams) => {
  if (!yamlTemplates || Object.keys(yamlTemplates).length === 0) {
    return {};
  }

  const result: Record<string, string> = {};
  const allMissingEnvVars = new Set<string>();
  const allMissingSecrets = new Set<string>();

  // Process each YAML template
  for (const [templateKey, yamlTemplate] of Object.entries(yamlTemplates)) {
    if (!yamlTemplate) {
      result[templateKey] = stringify({});
      continue;
    }

    const processedYamlString = stringify(yamlTemplate, {
      defaultStringType: Scalar.PLAIN,
    });

    const envVarRegex = /\${([A-Za-z0-9_]+)}/g;
    const secretsRegex = /\${secrets\.([A-Za-z0-9_]+)}/g;

    const envVarsInTemplate = new Set<string>();
    let match: RegExpExecArray | null;

    envVarRegex.lastIndex = 0;
    while ((match = envVarRegex.exec(processedYamlString)) !== null) {
      const envVarName = match[1];
      envVarsInTemplate.add(envVarName);
    }

    const secretsInTemplate = new Set<string>();
    secretsRegex.lastIndex = 0;
    while ((match = secretsRegex.exec(processedYamlString)) !== null) {
      const secretName = match[1];
      secretsInTemplate.add(secretName);
    }

    const missingEnvVars = Array.from(envVarsInTemplate).filter((varName) => !(varName in envVars));
    const missingSecrets = Array.from(secretsInTemplate).filter((secretName) => !(secretName in secretMappings));

    for (const varName of missingEnvVars) {
      allMissingEnvVars.add(varName);
    }

    for (const secretName of missingSecrets) {
      allMissingSecrets.add(secretName);
    }
  }

  if (allMissingEnvVars.size > 0 || allMissingSecrets.size > 0) {
    const errorParts = [];

    if (allMissingEnvVars.size > 0) {
      errorParts.push(`Missing environment variables: ${Array.from(allMissingEnvVars).join(', ')}`);
    }

    if (allMissingSecrets.size > 0) {
      errorParts.push(`Missing secret mappings: ${Array.from(allMissingSecrets).join(', ')}`);
    }

    throw new Error(errorParts.join('. '));
  }

  for (const [templateKey, yamlTemplate] of Object.entries(yamlTemplates)) {
    if (!yamlTemplate) {
      result[templateKey] = stringify({});
      continue;
    }

    let processedYamlString = stringify(yamlTemplate, {
      defaultStringType: Scalar.PLAIN,
    });

    const envVarRegex = /\${([A-Za-z0-9_]+)}/g;
    const secretsRegex = /\${secrets\.([A-Za-z0-9_]+)}/g;

    processedYamlString = processedYamlString.replace(envVarRegex, (_match: string, envVarName: string) => {
      const envValue = envVars?.[envVarName] || '';

      if (envVarName === 'POSTGRES_COMPATIBLE_TOPIC_NAME') {
        return toPostgresTableName(envValue);
      }

      // Special handling for glob patterns in environment variables
      return wrapGlobPattern(envValue);
    });

    processedYamlString = processedYamlString.replace(secretsRegex, (_match: string, secretName: string) => {
      const mappedName = secretMappings?.[secretName] || '';
      return `\${secrets.${mappedName}}`;
    });

    result[templateKey] = processedYamlString;
  }

  return result;
};
