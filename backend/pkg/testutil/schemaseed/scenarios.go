// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schemaseed

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
)

// Want is the correct decode result of a key or value. The zero value asserts
// nothing.
type Want struct {
	Encoding string // Console payload encoding, "" asserts nothing
	SchemaID int    // schema ID, 0 for no schema
	Context  string // context the schema resolves in, "" is the default
	Location string // "payload" or "header"
	JSON     string // decoded payload
	Error    string // text that a registry serde must report
}

// Scenario is one record and its correct decode result.
type Scenario struct {
	Name         string
	Topic        string // without the topic prefix
	TopicContext string
	Origin       string // context of the schema that encoded the record
	Record       *kgo.Record
	Key, Value   Want
}

// Fixture is the seeded data set.
type Fixture struct {
	Schemas   []*Schema
	Topics    map[string]string // topic to its bound context
	Scenarios []Scenario
}

var (
	allLocations     = []Location{Plain, PayloadID, HeaderID}
	encodedLocations = []Location{PayloadID, HeaderID}
)

var (
	customers = []string{
		`{"customer_id":"c-001","name":"Ada Lovelace","tier":"ENTERPRISE"}`,
		`{"customer_id":"c-002","name":"Alan Turing","tier":"PRO"}`,
		`{"customer_id":"c-003","name":"Grace Hopper","tier":"FREE"}`,
	}
	customerKeys = []string{`{"customer_id":"c-001"}`, `{"customer_id":"c-002"}`, `{"customer_id":"c-003"}`}
	shipments    = []string{
		`{"shipmentId":"s-100","orderId":"o-1","carrier":"UPS","items":["sku-1","sku-2"]}`,
		`{"shipmentId":"s-101","orderId":"o-2","carrier":"DHL","items":["sku-9"]}`,
	}
	orderKeys = []string{`{"order_id":"o-1","region":"us-east"}`, `{"order_id":"o-2","region":"eu-west"}`}
	payments  = []string{
		`{"payment_id":"p-9001","amount_cents":1999,"currency":"USD","status":"CAPTURED"}`,
		`{"payment_id":"p-9002","amount_cents":4500,"currency":"EUR","status":"AUTHORIZED"}`,
	}
)

const (
	productSample = `{"sku":"sku-1","name":"Widget","price":{"cents":"999","currency":"USD"}}`
	catalogSample = `{"products":[` + productSample + `]}`
	priceSample   = `{"cents":"250","currency":"EUR"}`
	invoiceSample = `{"invoiceId":"inv-1","amount":{"currency":"USD","units":"42","nanos":500000000},"customerId":"c-001"}`
	legacySample  = `{"id":7,"note":"written before the subject was soft-deleted"}`
)

type builder struct {
	schemas   []*Schema
	scenarios []Scenario
	err       error
}

func (b *builder) schema(schemaContext, subject string) *Schema {
	for _, s := range b.schemas {
		if s.Context == schemaContext && s.Subject == subject {
			return s
		}
	}
	panic(fmt.Sprintf("no fixture schema %q in context %q", subject, schemaContext))
}

func (b *builder) avro(s *Schema, sample string) encoded {
	e, err := encodeAvro(s, sample)
	if err != nil && b.err == nil {
		b.err = err
	}
	return e
}

func (b *builder) avroAll(s *Schema, samples []string) []encoded {
	out := make([]encoded, len(samples))
	for i, sample := range samples {
		out[i] = b.avro(s, sample)
	}
	return out
}

func (b *builder) proto(s *Schema, imports map[string]string, sample string, index ...int) encoded {
	e, err := encodeProto(s, imports, sample, index...)
	if err != nil && b.err == nil {
		b.err = err
	}
	return e
}

func jsonAll(s *Schema, samples []string) []encoded {
	out := make([]encoded, len(samples))
	for i, sample := range samples {
		out[i] = encodeJSON(s, sample)
	}
	return out
}

func encodingName(t sr.SchemaType) string {
	switch t {
	case sr.TypeProtobuf:
		return "protobuf"
	case sr.TypeJSON:
		return "json"
	default:
		return "avro"
	}
}

func newScenario(topic, name, origin, expect string) Scenario {
	return Scenario{
		Name:         name,
		Topic:        topic,
		TopicContext: topicContexts[topic],
		Origin:       origin,
		Record: &kgo.Record{
			Topic: topic,
			Headers: []kgo.RecordHeader{
				{Key: "seed.scenario", Value: []byte(name)},
				{Key: "seed.origin", Value: []byte(origin)},
				{Key: "seed.expect", Value: []byte(expect)},
			},
		},
		Key:   Want{Encoding: "null"},
		Value: Want{Encoding: "null"},
	}
}

// place puts an encoded message in the key or value of the scenario record and
// sets its correct result.
func place(sc *Scenario, isKey bool, e encoded, loc Location) {
	Place(sc.Record, isKey, loc, e.locator(), e.message)
	w := Want{
		Encoding: encodingName(e.schema.Type),
		SchemaID: e.schema.ID,
		Context:  e.schema.Context,
		Location: "payload",
		JSON:     e.json,
	}
	if loc.inHeader() {
		w.Location = "header"
	}
	if isKey {
		sc.Key = w
		return
	}
	sc.Value = w
}

// matrix adds every key and value location pair, except plain with plain.
func (b *builder) matrix(topic, origin string, keys, values []encoded) {
	i := -1
	for _, kl := range allLocations {
		for _, vl := range allLocations {
			i++
			if kl == Plain && vl == Plain {
				continue
			}
			sc := newScenario(topic, fmt.Sprintf("key=%s value=%s", kl, vl), origin, "ok")
			if kl == Plain {
				sc.Record.Key = fmt.Appendf(nil, "plain-key-%02d", i)
				sc.Key = Want{}
			} else {
				place(&sc, true, keys[i%len(keys)], kl)
			}
			if vl == Plain {
				plain := fmt.Sprintf(`{"plain":true,"n":%d}`, i)
				sc.Record.Value = []byte(plain)
				sc.Value = Want{Encoding: "json", JSON: plain}
			} else {
				place(&sc, false, values[i%len(values)], vl)
			}
			b.scenarios = append(b.scenarios, sc)
		}
	}
}

// single adds a record with an encoded value and an optional plain key.
func (b *builder) single(topic, what, origin, expect string, key []byte, e encoded, loc Location) {
	sc := newScenario(topic, fmt.Sprintf("value=%s %s", loc, what), origin, expect)
	if key != nil {
		sc.Record.Key = key
		sc.Key = Want{}
	}
	place(&sc, false, e, loc)
	b.scenarios = append(b.scenarios, sc)
}

// raw adds a record whose value bytes and schema header are given as is.
func (b *builder) raw(name, expect string, value []byte, header *kgo.RecordHeader, want Want) {
	sc := newScenario("edge-cases", name, "none", expect)
	sc.Record.Value = value
	if header != nil {
		sc.Record.Headers = append(sc.Record.Headers, *header)
	}
	sc.Value = want
	b.scenarios = append(b.scenarios, sc)
}

func buildScenarios(schemas []*Schema, base int) ([]Scenario, error) {
	b := &builder{schemas: schemas}

	custKey := b.schema(ContextDefault, "matrix-avro-default-key")
	cust := b.schema(ContextDefault, "matrix-avro-default-value")
	legacy := b.schema(ContextDefault, "legacy-value")
	catalog := b.schema(ContextDefault, "proto-nested-default-value")
	orderKey := b.schema(ContextStaging, "matrix-proto-staging-key")
	shipment := b.schema(ContextStaging, "matrix-proto-staging-value")
	prodCust := b.schema(ContextProd, "matrix-json-prod-key")
	payment := b.schema(ContextProd, "matrix-json-prod-value")
	invoice := b.schema(ContextProd, "refs-prod-value")

	custKeys := b.avroAll(custKey, customerKeys)
	custs := b.avroAll(cust, customers)
	prodCusts := b.avroAll(prodCust, customers)
	orderKeysEnc := jsonAll(orderKey, orderKeys)
	paymentsEnc := jsonAll(payment, payments)
	shipmentsEnc := []encoded{
		b.proto(shipment, nil, shipments[0], 1),
		b.proto(shipment, nil, shipments[1], 1),
	}
	catalogEnc := b.proto(catalog, nil, catalogSample, 0)
	productEnc := b.proto(catalog, nil, productSample, 0, 0)
	priceEnc := b.proto(catalog, nil, priceSample, 0, 0, 0)
	invoiceEnc := b.proto(invoice, map[string]string{"money.proto": protoMoney}, invoiceSample, 0)
	legacyEnc := b.avro(legacy, legacySample)
	if b.err != nil {
		return nil, b.err
	}

	b.matrix("matrix-avro-default", "default", custKeys, custs)
	b.matrix("matrix-proto-staging", ContextStaging, orderKeysEnc, shipmentsEnc)
	b.matrix("matrix-json-prod", ContextProd, prodCusts, paymentsEnc)

	for _, m := range []struct {
		name string
		enc  encoded
	}{
		{"acme.catalog.Catalog", catalogEnc},
		{"acme.catalog.Catalog.Product", productEnc},
		{"acme.catalog.Catalog.Product.Price", priceEnc},
	} {
		for _, loc := range encodedLocations {
			b.single("proto-nested-default", m.name, "default", "ok", []byte(m.name), m.enc, loc)
		}
	}

	for _, loc := range encodedLocations {
		b.single("refs-prod", "Invoice", ContextProd, "ok", []byte("inv-1"), invoiceEnc, loc)
	}

	b.edgeCases(base, custKeys[0], custs[0], legacyEnc)

	return b.scenarios, nil
}

func (b *builder) edgeCases(base int, key, value, legacy encoded) {
	const topic = "edge-cases"
	valueHeader := func(v []byte) *kgo.RecordHeader {
		return &kgo.RecordHeader{Key: ValueSchemaIDHeader, Value: v}
	}
	headerError := Want{Error: ValueSchemaIDHeader + " header"}

	sc := newScenario(topic, "tombstone, key=payload-id", "default", "ok: key decodes, value is null")
	place(&sc, true, key, PayloadID)
	b.scenarios = append(b.scenarios, sc)

	b.raw("value=payload-id unknown ID", "error: schema ID not found",
		append(IDLocator(base+9999), value.message...), nil,
		Want{Error: "not found"})
	b.raw("value=header-id truncated", "error: truncated ID header",
		value.message, valueHeader([]byte{0, 0, 0}), headerError)
	b.raw("value=header empty", "error: empty schema ID header",
		value.message, valueHeader([]byte{}), headerError)
	b.raw("value=payload unknown magic byte", "error: unknown magic byte 0x02",
		append([]byte{0x02}, value.message...), nil,
		Want{Error: "magic byte"})
	b.raw("value=plain", "ok: plain JSON, no schema",
		[]byte(`{"plain":true}`), nil,
		Want{Encoding: "json", JSON: `{"plain":true}`})

	b.single(topic, "soft-deleted schema", "default", "ok: schema is soft-deleted, ID lookup still works", nil, legacy, PayloadID)

	sc = newScenario(topic, "value=payload-id with a null schema ID header", "default", "ok: a null header selects the payload")
	sc.Record.Headers = append(sc.Record.Headers, *valueHeader(nil))
	place(&sc, false, value, PayloadID)
	b.scenarios = append(b.scenarios, sc)
}
