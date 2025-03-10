// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/sr"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	shopv1_2 "github.com/redpanda-data/console/backend/pkg/kafka/testdata/proto_update/gen/shop/v1"
)

var (
	cmdVar         string
	cmdInputVar    string
	cmdSchemaIDVar int
	cmdIndexVar    int
)

func init() {
	flag.StringVar(&cmdVar, "cmd", "serialize", "command")
	flag.StringVar(&cmdInputVar, "input", "", "command input")
	flag.IntVar(&cmdSchemaIDVar, "schema-id", -1, "schema id")
	flag.IntVar(&cmdIndexVar, "index", 0, "index")
}

type serializeInput struct {
	ID         string `json:"id"`
	CreatedAt  string `json:"created_at"`
	Version    int32  `json:"version"`
	OrderValue int32  `json:"order_value"`
}

func main() {
	flag.Parse()

	cmdInputVar = strings.TrimSpace(cmdInputVar)
	if len(cmdInputVar) == 0 {
		fmt.Fprintln(os.Stderr, "empty input")
		os.Exit(1)
	}

	switch cmdVar {
	case "serialize":
		serialize(cmdInputVar, cmdSchemaIDVar, cmdIndexVar)
	case "deserialize":
		deserialize(cmdInputVar, cmdSchemaIDVar, cmdIndexVar)
	default:
		fmt.Fprintf(os.Stderr, "unrecognized command: %s", cmdInputVar)
		os.Exit(1)
	}
}

func serialize(jsonInput string, schemaID, index int) {
	input := serializeInput{}
	err := json.Unmarshal([]byte(jsonInput), &input)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	orderCreatedAt, err := time.Parse(time.DateTime, input.CreatedAt)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	msg := shopv1_2.Order{
		Id:         input.ID,
		Version:    input.Version,
		OrderValue: input.OrderValue,
		CreatedAt:  timestamppb.New(orderCreatedAt),
	}

	var data []byte
	if schemaID >= 0 {
		var serde sr.Serde
		serde.Register(
			schemaID,
			&shopv1_2.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv1_2.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv1_2.Order))
			}),
			sr.Index(index),
		)

		data, err = serde.Encode(&msg)
	} else {
		data, err = proto.Marshal(&msg)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	_, err = os.Stdout.Write([]byte(base64.StdEncoding.EncodeToString(data)))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func deserialize(base64input string, schemaID, index int) {
	binData, err := base64.StdEncoding.DecodeString(base64input)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	msg := shopv1_2.Order{}

	if schemaID >= 0 {
		var serde sr.Serde
		serde.Register(
			schemaID,
			&shopv1_2.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv1_2.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv1_2.Order))
			}),
			sr.Index(index),
		)

		err = serde.Decode(binData, &msg)
	} else {
		err = proto.Unmarshal(binData, &msg)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	b, err := protojson.Marshal(&msg)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	_, err = os.Stdout.Write(b)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
