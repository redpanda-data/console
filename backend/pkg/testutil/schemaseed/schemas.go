// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package schemaseed provides schemas and records that cover every schema
// locator form (ID or GUID, in the payload or in a record header) across
// Schema Registry contexts with colliding schema IDs.
package schemaseed

import (
	"github.com/twmb/franz-go/pkg/sr"
)

// Schema Registry contexts used by the fixture.
const (
	ContextDefault = ""
	ContextStaging = ".staging"
	ContextProd    = ".prod"
)

// Schema is one registered schema of the fixture.
type Schema struct {
	Context    string
	Subject    string
	ID         int
	Type       sr.SchemaType
	Text       string
	References []sr.SchemaReference
	SoftDelete bool
	// GUID is set once the schema is registered.
	GUID string
}

// QualifiedSubject returns the subject with its context prefix.
func (s *Schema) QualifiedSubject() string {
	if s.Context == ContextDefault {
		return s.Subject
	}
	return ":" + s.Context + ":" + s.Subject
}

func (s *Schema) registrySchema() sr.Schema {
	return sr.Schema{Schema: s.Text, Type: s.Type, References: s.References}
}

const (
	avroCustomerKey = `{"type":"record","name":"CustomerKey","namespace":"com.acme","fields":[{"name":"customer_id","type":"string"}]}`
	avroCustomer    = `{"type":"record","name":"Customer","namespace":"com.acme","fields":[{"name":"customer_id","type":"string"},{"name":"name","type":"string"},{"name":"tier","type":{"type":"enum","name":"Tier","symbols":["FREE","PRO","ENTERPRISE"]}}]}`
	avroLegacy      = `{"type":"record","name":"LegacyEvent","namespace":"com.acme.legacy","fields":[{"name":"id","type":"long"},{"name":"note","type":"string"}]}`
	avroDeviceKey   = `{"type":"record","name":"DeviceKey","namespace":"com.acme.iot","fields":[{"name":"device_id","type":"string"}]}`
	avroTelemetry   = `{"type":"record","name":"Telemetry","namespace":"com.acme.iot","fields":[{"name":"device_id","type":"string"},{"name":"temperature_c","type":"double"},{"name":"battery_pct","type":"int"}]}`

	jsonOrderKey = `{"$schema":"http://json-schema.org/draft-07/schema#","title":"OrderKey","type":"object","properties":{"order_id":{"type":"string"},"region":{"type":"string"}},"required":["order_id"]}`
	jsonPayment  = `{"$schema":"http://json-schema.org/draft-07/schema#","title":"Payment","type":"object","properties":{"payment_id":{"type":"string"},"amount_cents":{"type":"integer"},"currency":{"type":"string"},"status":{"enum":["AUTHORIZED","CAPTURED","REFUNDED"]}},"required":["payment_id","amount_cents"]}`

	protoShipment = `syntax = "proto3";
package acme.staging;

message Order {
  string order_id = 1;
  int64 total_cents = 2;
}

message Shipment {
  string shipment_id = 1;
  string order_id = 2;
  string carrier = 3;
  repeated string items = 4;
}
`
	protoCatalog = `syntax = "proto3";
package acme.catalog;

message Catalog {
  message Product {
    message Price {
      int64 cents = 1;
      string currency = 2;
    }
    string sku = 1;
    string name = 2;
    Price price = 3;
  }
  repeated Product products = 1;
}
`
	protoMoney = `syntax = "proto3";
package acme.common;

message Money {
  string currency = 1;
  int64 units = 2;
  int32 nanos = 3;
}
`
	protoInvoice = `syntax = "proto3";
package acme.billing;

import "money.proto";

message Invoice {
  string invoice_id = 1;
  acme.common.Money amount = 2;
  string customer_id = 3;
}
`
)

// newSchemas returns the fixture schemas. Each context reuses the IDs base+1
// to base+4 for different schemas.
func newSchemas(base int) []*Schema {
	return []*Schema{
		{Context: ContextDefault, Subject: "matrix-avro-default-key", ID: base + 1, Type: sr.TypeAvro, Text: avroCustomerKey},
		{Context: ContextDefault, Subject: "matrix-avro-default-value", ID: base + 2, Type: sr.TypeAvro, Text: avroCustomer},
		{Context: ContextDefault, Subject: "legacy-value", ID: base + 3, Type: sr.TypeAvro, Text: avroLegacy, SoftDelete: true},
		{Context: ContextDefault, Subject: "proto-nested-default-value", ID: base + 4, Type: sr.TypeProtobuf, Text: protoCatalog},
		{Context: ContextStaging, Subject: "matrix-proto-staging-key", ID: base + 1, Type: sr.TypeJSON, Text: jsonOrderKey},
		{Context: ContextStaging, Subject: "matrix-proto-staging-value", ID: base + 2, Type: sr.TypeProtobuf, Text: protoShipment},
		{Context: ContextStaging, Subject: "native-rpk-staging-key", ID: base + 3, Type: sr.TypeAvro, Text: avroDeviceKey},
		{Context: ContextStaging, Subject: "native-rpk-staging-value", ID: base + 4, Type: sr.TypeAvro, Text: avroTelemetry},
		{Context: ContextProd, Subject: "money.proto", ID: base + 1, Type: sr.TypeProtobuf, Text: protoMoney},
		{Context: ContextProd, Subject: "matrix-json-prod-key", ID: base + 2, Type: sr.TypeAvro, Text: avroCustomer},
		{Context: ContextProd, Subject: "matrix-json-prod-value", ID: base + 3, Type: sr.TypeJSON, Text: jsonPayment},
		{
			Context: ContextProd, Subject: "refs-prod-value", ID: base + 4, Type: sr.TypeProtobuf, Text: protoInvoice,
			References: []sr.SchemaReference{{Name: "money.proto", Subject: "money.proto", Version: 1}},
		},
	}
}

// topicContexts maps each fixture topic to the context it is bound to with
// redpanda.schema.registry.context.
var topicContexts = map[string]string{
	"matrix-avro-default":         ContextDefault,
	"matrix-proto-staging":        ContextStaging,
	"matrix-json-prod":            ContextProd,
	"proto-nested-default":        ContextDefault,
	"refs-prod":                   ContextProd,
	"guid-required-unbound":       ContextDefault,
	"guid-required-cross-context": ContextStaging,
	"edge-cases":                  ContextDefault,
}
