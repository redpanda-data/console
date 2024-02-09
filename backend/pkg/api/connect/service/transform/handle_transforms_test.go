package transform

import (
	"fmt"
	"testing"

	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"
	"github.com/stretchr/testify/assert"
)

func Test_findTransformByName(t *testing.T) {
	type args struct {
		ts   []adminapi.TransformMetadata
		name string
	}
	tests := []struct {
		name    string
		args    args
		want    *adminapi.TransformMetadata
		wantErr assert.ErrorAssertionFunc
	}{
		{
			name: "Find existing transform",
			args: args{
				ts: []adminapi.TransformMetadata{
					{Name: "TransformA", InputTopic: "input-topic-a", OutputTopics: []string{"output-topic-a1", "output-topic-a2"}},
					{Name: "TransformB", InputTopic: "input-topic-b", OutputTopics: []string{"output-topic-b1", "output-topic-b2"}},
				},
				name: "TransformA",
			},
			want:    &adminapi.TransformMetadata{Name: "TransformA", InputTopic: "input-topic-a", OutputTopics: []string{"output-topic-a1", "output-topic-a2"}},
			wantErr: assert.NoError,
		},
		{
			name: "Transform does not exist",
			args: args{
				ts: []adminapi.TransformMetadata{
					{Name: "TransformA", InputTopic: "input-topic-a", OutputTopics: []string{"output-topic-a1", "output-topic-a2"}},
					{Name: "TransformB", InputTopic: "input-topic-b", OutputTopics: []string{"output-topic-b1", "output-topic-b2"}},
				},
				name: "TransformC",
			},
			want:    nil,
			wantErr: assert.Error,
		},
		{
			name: "Empty transform list",
			args: args{
				ts:   []adminapi.TransformMetadata{},
				name: "TransformA",
			},
			want:    nil,
			wantErr: assert.Error,
		},
		{
			name: "Duplicate transform names",
			args: args{
				ts: []adminapi.TransformMetadata{
					{Name: "TransformA", InputTopic: "input-topic-a", OutputTopics: []string{"output-topic-a1", "output-topic-a2"}},
					{Name: "TransformA", InputTopic: "input-topic-a-duplicate", OutputTopics: []string{"output-topic-a1-duplicate", "output-topic-a2-duplicate"}},
				},
				name: "TransformA",
			},
			want:    &adminapi.TransformMetadata{Name: "TransformA", InputTopic: "input-topic-a", OutputTopics: []string{"output-topic-a1", "output-topic-a2"}},
			wantErr: assert.NoError,
		},
		{
			name: "Null slice of transforms",
			args: args{
				ts:   nil,
				name: "TransformA",
			},
			want:    nil,
			wantErr: assert.Error,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := findExactTransformByName(tt.args.ts, tt.args.name)
			if !tt.wantErr(t, err, fmt.Sprintf("findExactTransformByName(%v, %v)", tt.args.ts, tt.args.name)) {
				return
			}
			assert.Equalf(t, tt.want, got, "findExactTransformByName(%v, %v)", tt.args.ts, tt.args.name)
		})
	}
}
