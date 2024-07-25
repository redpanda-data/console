package docs

// JSONSchema serializes a field spec into a JSON schema structure.
func (f FieldSpec) JSONSchema() (schema, uiSchema map[string]interface{}) {
	schema, uiSchema = map[string]interface{}{}, map[string]interface{}{}
	switch f.Kind {
	case Kind2DArray:
		innerField := f
		innerField.Kind = KindArray
		schema["type"] = "array"
		itemsSpec, itemsUI := innerField.JSONSchema()
		if itemsSpec == nil {
			return nil, nil
		}
		delete(itemsSpec, "default")
		schema["items"] = itemsSpec
		uiSchema = itemsUI
	case KindArray:
		innerField := f
		innerField.Kind = KindScalar
		schema["type"] = "array"
		itemsSpec, itemsUI := innerField.JSONSchema()
		if itemsSpec == nil {
			return nil, nil
		}
		delete(itemsSpec, "default")
		schema["items"] = itemsSpec
		uiSchema = itemsUI
	case KindMap:
		// TODO: Maps don't seem to work good, the JSONSchema "way" is to add a
		// `patternProperties` field with `.: innerSpec`, but that doesn't work
		// with react-jsonschema-form so we'll need to find a different way.

		// For now I'm just listing additional properties as true for string
		// maps, this allows http headers and simple fields to be configured,
		// but means maps such as dynamic input/output children are omitted.
		if f.Type == FieldTypeString {
			schema["type"] = "object"
			schema["additionalProperties"] = true
		}

		// We eventually want this:
		//
		// innerField := f
		// innerField.Kind = KindScalar
		// itemsSpec, itemsUI := innerField.JSONSchema()
		// if itemsSpec == nil {
		// 	return nil, nil
		// }
		// delete(itemsSpec, "default")
		// uiSchema = itemsUI

		// schema["type"] = "object"
		// schema["patternProperties"] = map[string]any{
		// 	".": itemsSpec,
		// }
	default:
		if f.Type == FieldTypeObject || len(f.Children) > 0 {
			schema["type"] = "object"
			schema["properties"], uiSchema = f.Children.JSONSchema()
			var required []string
			for _, child := range f.Children {
				if !child.IsOptional && !child.IsDeprecated && child.Default == nil && len(child.Children) == 0 {
					required = append(required, child.Name)
				}
			}
			if len(required) > 0 {
				schema["required"] = required
			}
			schema["additionalProperties"] = false
			return
		}
		switch f.Type {
		case FieldTypeBool:
			schema["type"] = "boolean"
		case FieldTypeString:
			if f.Bloblang {
				uiSchema["ui:widget"] = "bloblang"
			} else if f.Name == "program" || f.Name == "query" {
				uiSchema["ui:widget"] = "bigText"
			} else if f.Name == "code" {
				uiSchema["ui:widget"] = "javascript"
			}
			schema["type"] = "string"
		case FieldTypeInt:
			schema["type"] = "number"
		case FieldTypeFloat:
			schema["type"] = "number"
		case FieldTypeInput,
			FieldTypeBuffer,
			FieldTypeCache,
			FieldTypeProcessor,
			FieldTypeRateLimit,
			FieldTypeOutput,
			FieldTypeMetrics,
			FieldTypeTracer:
			return nil, nil
		default:
			return nil, nil
		}
		if f.Default != nil {
			schema["default"] = *f.Default
		}
	}
	return
}

// JSONSchema serializes a field spec into a JSON schema structure.
func (f FieldSpecs) JSONSchema() (schema, uiSchema map[string]interface{}) {
	schema, uiSchema = map[string]interface{}{}, map[string]interface{}{}
	var order []string

	for _, field := range f {
		if field.IsDeprecated {
			continue
		}
		order = append(order, field.Name)
		if tmpSchema, tmpUISchema := field.JSONSchema(); tmpSchema != nil {
			schema[field.Name] = tmpSchema
			if len(tmpUISchema) > 0 {
				uiSchema[field.Name] = tmpUISchema
			}
		}
	}

	uiSchema["ui:order"] = order
	return
}
