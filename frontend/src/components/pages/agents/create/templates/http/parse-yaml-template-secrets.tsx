interface ParseYamlTemplateSecretsParams {
  yamlTemplates: Record<string, string>;
  envVars: Record<string, string>;
  secretMappings: Record<string, string>;
}

// These vars are already predefined
const whitelistedVars = ['REDPANDA_BROKERS'];

/**
 * Processes one or more YAML templates by replacing environment variables with their values
 * and standardizing secret references using provided mappings
 */
export const parseYamlTemplateSecrets = ({
  yamlTemplates,
  envVars = {},
  secretMappings = {},
}: ParseYamlTemplateSecretsParams): Record<string, string> => {
  if (!yamlTemplates || Object.keys(yamlTemplates).length === 0) {
    return {};
  }

  const result: Record<string, string> = {};
  const allMissingEnvVars = new Set<string>();
  const allMissingSecrets = new Set<string>();

  // Process each YAML template
  for (const [templateKey, yamlTemplate] of Object.entries(yamlTemplates)) {
    if (!yamlTemplate) {
      result[templateKey] = '';
      continue;
    }

    // Find all environment variables and secrets in the template
    const envVarRegex = /\${([A-Za-z0-9_]+)}/g;
    const secretsRegex = /\${secrets\.([A-Za-z0-9_]+)}/g;

    // Collect all environment variables referenced in the template
    const envVarsInTemplate = new Set<string>();
    let match: RegExpExecArray | null;
    const templateCopy = yamlTemplate.slice();

    while ((match = envVarRegex.exec(templateCopy)) !== null) {
      const envVarName = match[1];
      envVarsInTemplate.add(envVarName);
    }

    // Collect all secrets referenced in the template
    const secretsInTemplate = new Set<string>();
    while ((match = secretsRegex.exec(templateCopy)) !== null) {
      const secretName = match[1];
      secretsInTemplate.add(secretName);
    }

    // Find missing environment variables and secrets
    const missingEnvVars = Array.from(envVarsInTemplate).filter(
      (varName) => !(varName in envVars) && !whitelistedVars.includes(varName),
    );

    const missingSecrets = Array.from(secretsInTemplate).filter((secretName) => !(secretName in secretMappings));

    // Collect all missing values
    for (const varName of missingEnvVars) {
      allMissingEnvVars.add(varName);
    }

    for (const secretName of missingSecrets) {
      allMissingSecrets.add(secretName);
    }
  }

  // Throw error if any environment variables or secrets are missing
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

  // Now that we've validated all templates, process each one
  for (const [templateKey, yamlTemplate] of Object.entries(yamlTemplates)) {
    if (!yamlTemplate) {
      result[templateKey] = '';
      continue;
    }

    const envVarRegex = /\${([A-Za-z0-9_]+)}/g;
    const secretsRegex = /\${secrets\.([A-Za-z0-9_]+)}/g;

    // Replace environment variables with their actual values
    const processedYamlWithEnvVars = yamlTemplate.replace(envVarRegex, (_match, envVarName) => {
      const envValue = envVars?.[envVarName];
      return envValue;
    });

    // Replace secret values with a standardized format based on provided mappings
    const processedYaml = processedYamlWithEnvVars.replace(secretsRegex, (_match, secretName) => {
      const mappedName = secretMappings?.[secretName];
      return `\${secrets.${mappedName}}`;
    });

    result[templateKey] = processedYaml;
  }

  return result;
};
