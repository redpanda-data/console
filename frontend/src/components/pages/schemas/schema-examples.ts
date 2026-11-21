import type { SchemaTypeType } from '../../../state/rest-interfaces';

export const exampleSchema: Record<SchemaTypeType, string> = {
  AVRO: `
{
   "type": "record",
   "name": "car",
   "fields": [
      {
         "name": "model",
         "type": "string"
      },
      {
         "name": "make",
         "type": "string"
      },
      {
         "name": "year",
         "type": "float"
      }
   ]
}
`.trim(),

  PROTOBUF: `
syntax = "proto3";

message Car {
   string make = 1;
   string model = 2;
   int32 year = 3;
}
`.trim(),

  JSON: `
    {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    }
  },
  "required": ["name"],
  "additionalProperties": false
}
    `.trim(),
} as const;
