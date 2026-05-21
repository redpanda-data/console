// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/protobuf/reflect/protoreflect"

	"github.com/redpanda-data/console/backend/pkg/proto"
)

// protoMessageTypesByID walks the descriptor tree of the schema, returning each message paired with
// its Confluent wire-format index path. Goes through cachedSchemaClient so it works without the
// optional static Protobuf service.
func (s *Service) protoMessageTypesByID(ctx context.Context, schemaID int) ([]proto.MessageTypeInfo, error) {
	if s.cachedSchemaClient == nil {
		return nil, errors.New("schema registry is not configured")
	}

	files, rootFilename, err := s.cachedSchemaClient.ProtoFilesByID(ctx, schemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to load proto files for schema %d: %w", schemaID, err)
	}

	rootFile := files.FindFileByPath(rootFilename)
	if rootFile == nil {
		return nil, fmt.Errorf("root proto file %q not found for schema %d", rootFilename, schemaID)
	}

	var out []proto.MessageTypeInfo
	walkMessageTypes(rootFile.Messages(), nil, &out)
	return out, nil
}

func walkMessageTypes(msgs protoreflect.MessageDescriptors, prefix []int32, out *[]proto.MessageTypeInfo) {
	for i := 0; i < msgs.Len(); i++ {
		md := msgs.Get(i)
		path := append(append([]int32(nil), prefix...), int32(i))
		*out = append(*out, proto.MessageTypeInfo{
			FullyQualifiedName: string(md.FullName()),
			IndexPath:          path,
		})
		walkMessageTypes(md.Messages(), path, out)
	}
}
