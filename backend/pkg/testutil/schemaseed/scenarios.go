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
	SchemaID int    // resolved schema ID, 0 for no schema
	GUID     string // set when the locator is a GUID
	Context  string // context the schema resolves in, "" is the default
	Location string // "payload" or "header"
	JSON     string // decoded payload
	Error    string // text that a registry serde must report

	// WrongSchema marks an integer ID that resolves to another schema in the
	// topic's context. Only a GUID decodes such a record correctly.
	WrongSchema bool
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

const bogusGUID = "00000000-dead-beef-0000-000000000000"

var (
	allLocations     = []Location{Plain, PayloadID, PayloadGUID, HeaderID, HeaderGUID}
	encodedLocations = []Location{PayloadID, PayloadGUID, HeaderID, HeaderGUID}
	guidFirst        = []Location{PayloadGUID, HeaderGUID, PayloadID, HeaderID}
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

// resolve returns the schema that a locator of e resolves to on a topic bound
// to topicContext: an ID in that context, a GUID in that context, then the
// default context, then the first one registered.
func (b *builder) resolve(e encoded, loc Location, topicContext string) *Schema {
	if !loc.isGUID() {
		for _, s := range b.schemas {
			if s.Context == topicContext && s.ID == e.schema.ID {
				return s
			}
		}
		return nil
	}
	var pick *Schema
	for _, s := range b.schemas {
		if s.GUID != e.schema.GUID {
			continue
		}
		if s.Context == topicContext {
			return s
		}
		if pick == nil || (s.Context == ContextDefault && pick.Context != ContextDefault) {
			pick = s
		}
	}
	return pick
}

func (b *builder) want(e encoded, loc Location, topicContext string) Want {
	var w Want
	resolved := b.resolve(e, loc, topicContext)
	if resolved == nil || resolved.GUID != e.schema.GUID {
		w.WrongSchema = true
		return w
	}
	w.Encoding = encodingName(e.schema.Type)
	w.SchemaID = resolved.ID
	w.Context = resolved.Context
	w.JSON = e.json
	w.Location = "payload"
	if loc.inHeader() {
		w.Location = "header"
	}
	if loc.isGUID() {
		w.GUID = e.schema.GUID
	}
	return w
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

func (b *builder) place(sc *Scenario, isKey bool, e encoded, loc Location) {
	Place(sc.Record, isKey, loc, e.locator(loc), e.message)
	w := b.want(e, loc, sc.TopicContext)
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
				b.place(&sc, true, keys[i%len(keys)], kl)
			}
			if vl == Plain {
				plain := fmt.Sprintf(`{"plain":true,"n":%d}`, i)
				sc.Record.Value = []byte(plain)
				sc.Value = Want{Encoding: "json", JSON: plain}
			} else {
				b.place(&sc, false, values[i%len(values)], vl)
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
	b.place(&sc, false, e, loc)
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

//nolint:funlen // one table of scenarios
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

	// Unbound topic: integer IDs resolve in the default context.
	for _, c := range []struct {
		what, origin, wrong string
		enc                 encoded
	}{
		{"Shipment", ContextStaging, "default id 2 is Avro Customer", shipmentsEnc[0]},
		{"Payment", ContextProd, "default id 3 is soft-deleted Avro LegacyEvent", paymentsEnc[0]},
		{"Invoice", ContextProd, "default id 4 is Protobuf Catalog", invoiceEnc},
		{"OrderKey", ContextStaging, "default id 1 is Avro CustomerKey", orderKeysEnc[0]},
	} {
		for _, loc := range guidFirst {
			expect := "ok"
			if !loc.isGUID() {
				expect = "wrong-schema: " + c.wrong
			}
			b.single("guid-required-unbound", c.what, c.origin, expect, nil, c.enc, loc)
		}
	}
	b.single("guid-required-unbound", "Customer", ContextProd,
		"ok-by-coincidence: default id 2 has the same schema and GUID", nil, prodCusts[0], PayloadID)
	b.single("guid-required-unbound", "Customer", ContextProd,
		"ok: GUID is registered in default and .prod", nil, prodCusts[0], HeaderGUID)

	// Topic bound to .staging with records whose schemas are elsewhere.
	for _, c := range []struct {
		what, origin, wrong string
		enc                 encoded
	}{
		{"Payment", ContextProd, ".staging id 3 is Avro DeviceKey", paymentsEnc[1]},
		{"Catalog", "default", ".staging id 4 is Avro Telemetry", catalogEnc},
		{"Customer", "default", ".staging id 2 is Protobuf Shipment", custs[1]},
	} {
		for _, loc := range guidFirst {
			expect := "ok"
			if !loc.isGUID() {
				expect = "wrong-schema: " + c.wrong
			}
			b.single("guid-required-cross-context", c.what, c.origin, expect, nil, c.enc, loc)
		}
	}
	b.single("guid-required-cross-context", "Shipment", ContextStaging, "ok: native context", nil, shipmentsEnc[1], PayloadID)
	b.single("guid-required-cross-context", "Shipment", ContextStaging, "ok: native context", nil, shipmentsEnc[1], HeaderGUID)

	b.edgeCases(base, custKeys[0], custs[0], legacyEnc, productEnc, catalog)

	return b.scenarios, nil
}

func (b *builder) edgeCases(base int, key, value, legacy, product encoded, catalog *Schema) {
	const topic = "edge-cases"
	valueHeader := func(v []byte) *kgo.RecordHeader {
		return &kgo.RecordHeader{Key: ValueSchemaIDHeader, Value: v}
	}
	bogus := GUIDLocator(bogusGUID)
	headerError := Want{Error: ValueSchemaIDHeader + " header"}

	sc := newScenario(topic, "tombstone, key=payload-id", "default", "ok: key decodes, value is null")
	b.place(&sc, true, key, PayloadID)
	b.scenarios = append(b.scenarios, sc)

	sc = newScenario(topic, "tombstone, key=header-guid", "default", "ok: key decodes, value is null")
	b.place(&sc, true, key, HeaderGUID)
	b.scenarios = append(b.scenarios, sc)

	b.single(topic, "null key", "default", "ok: null key", nil, value, HeaderGUID)

	sc = newScenario(topic, "value=header-guid after an unknown GUID header", "default", "ok: the last __value_schema_id header wins")
	sc.Record.Headers = append(sc.Record.Headers, *valueHeader(bogus))
	b.place(&sc, false, value, HeaderGUID)
	b.scenarios = append(b.scenarios, sc)

	sc = newScenario(topic, "value=header-id before an unknown GUID header", "default", "error: the last __value_schema_id header is an unknown GUID")
	b.place(&sc, false, value, HeaderID)
	sc.Record.Headers = append(sc.Record.Headers, *valueHeader(bogus))
	sc.Value = Want{Error: "not found"}
	b.scenarios = append(b.scenarios, sc)

	b.raw("value=payload-guid unknown GUID", "error: GUID not found",
		append(append([]byte{}, bogus...), value.message...), nil,
		Want{Error: "not found"})
	b.raw("value=payload-id unknown ID", "error: schema ID not found",
		append(IDLocator(base+9999), value.message...), nil,
		Want{Error: "not found"})
	b.raw("value=header-guid truncated", "error: truncated GUID header",
		value.message, valueHeader(value.locator(HeaderGUID)[:9]), headerError)
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
	b.single(topic, "soft-deleted schema", "default", "ok: GUID of a soft-deleted schema still resolves", nil, legacy, HeaderGUID)

	b.raw("value=header-guid malformed Protobuf indexes", "error: malformed Protobuf message indexes",
		product.message, valueHeader(append(GUIDLocator(catalog.GUID), 0x7f)),
		Want{Error: "index"})

	sc = newScenario(topic, "value=payload-id with a null schema ID header", "default", "ok: a null header selects the payload")
	sc.Record.Headers = append(sc.Record.Headers, *valueHeader(nil))
	b.place(&sc, false, value, PayloadID)
	b.scenarios = append(b.scenarios, sc)
}
