package interceptor

import (
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestResource(t *testing.T) {
	assert := require.New(t)
	i := dataplanev1.UpdatePipelineRequest{
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"tags"}},
		Pipeline: &dataplanev1.PipelineUpdate{
			Tags: map[string]string{
				"a": "b",
			},
		},
	}

	rn, ok := findResourceName(&i)
	assert.True(ok)
	assert.Equal("pipeline", rn)
}
