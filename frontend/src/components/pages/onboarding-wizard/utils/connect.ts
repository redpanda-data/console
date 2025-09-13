import benthosSchema from '../../../../assets/rp-connect-schema.json';
import type { DataType } from '../types';

export const getConnections = (dataType: DataType): string[] => {
  const connectionType = dataType === 'source' ? 'input' : 'output';
  const schema = benthosSchema.definitions[connectionType];

  // Navigate the schema structure to extract connection names
  const connectionNames: string[] = [];

  if (schema?.allOf?.[0]?.anyOf) {
    schema.allOf[0].anyOf.forEach((item) => {
      if (item.properties) {
        connectionNames.push(...Object.keys(item.properties));
      }
    });
  }

  return connectionNames;
};

export type ConnectionType = {
  name: string;
  /** Logo or icon */
  src?: string;
  /** URL to documentation */
  docUrl?: string;
  /** URL to secondary documentation */
  docUrl2?: string;
  /** format of documentation */
  docFormat?: 'markdown' | 'asciidoc';
};
