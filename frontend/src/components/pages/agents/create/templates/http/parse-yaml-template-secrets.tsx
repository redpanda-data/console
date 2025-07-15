/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: part of parse-yaml-template-secrets implementation */
import { Scalar, stringify } from 'yaml';

type YamlTemplate = Record<string, any>;
interface ParseYamlTemplateSecretsParams {
  yamlTemplates: Record<string, YamlTemplate>;
  envVars: Record<string, string | undefined>;
  secretMappings: Record<string, string | undefined>;
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
 * Processes comma-separated glob patterns into an array of patterns
 * for YAML include_patterns or exclude_patterns
 */
const processGlobPatterns = (patternsString: string): string[] => {
  // If there are no commas, return a single item array with the trimmed pattern
  if (!patternsString.includes(',')) {
    return [patternsString.trim()];
  }

  // Split by comma, trim each pattern, and filter out empty entries
  return patternsString
    .split(',')
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
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

    // Special handling for INCLUDE_GLOB_PATTERN in include_patterns
    if (
      envVars?.INCLUDE_GLOB_PATTERN &&
      yamlTemplate.input?.git?.include_patterns?.[0] &&
      typeof yamlTemplate.input?.git?.include_patterns?.[0] === 'string' &&
      yamlTemplate.input?.git?.include_patterns?.[0].includes('${INCLUDE_GLOB_PATTERN}')
    ) {
      const patterns = processGlobPatterns(envVars.INCLUDE_GLOB_PATTERN);
      yamlTemplate.input.git.include_patterns = patterns;
    }

    // Special handling for EXCLUDE_GLOB_PATTERN in exclude_patterns
    if (
      envVars?.EXCLUDE_GLOB_PATTERN !== undefined &&
      yamlTemplate.input?.git?.exclude_patterns?.[0] &&
      typeof yamlTemplate.input?.git?.exclude_patterns?.[0] === 'string' &&
      yamlTemplate.input?.git?.exclude_patterns?.[0].includes('${EXCLUDE_GLOB_PATTERN}')
    ) {
      const trimmedPattern = envVars.EXCLUDE_GLOB_PATTERN.trim();

      // If EXCLUDE_GLOB_PATTERN is empty after trimming, remove exclude_patterns from YAML
      if (trimmedPattern === '') {
        yamlTemplate.input.git.exclude_patterns = undefined;
      } else {
        const patterns = processGlobPatterns(trimmedPattern);
        if (patterns.length > 0) {
          yamlTemplate.input.git.exclude_patterns = patterns;
        } else {
          yamlTemplate.input.git.exclude_patterns = undefined;
        }
      }
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

      // Skip INCLUDE_GLOB_PATTERN when it appears in include_patterns as it's handled separately
      if (envVarName === 'INCLUDE_GLOB_PATTERN' && processedYamlString.includes('include_patterns:')) {
        return envValue;
      }

      // Skip EXCLUDE_GLOB_PATTERN when it appears in exclude_patterns as it's handled separately
      if (envVarName === 'EXCLUDE_GLOB_PATTERN' && processedYamlString.includes('exclude_patterns:')) {
        return envValue;
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
