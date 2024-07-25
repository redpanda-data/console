package graph

import (
	"path"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/docs"
)

func fieldToActions(spec docs.FieldSpec) (actions []NodeAction) {
	if spec.IsDeprecated {
		return
	}
	if coreType, isCore := spec.Type.IsCoreComponent(); isCore {
		switch spec.Kind {
		case docs.KindArray:
			actions = append(actions, NodeAction{
				Operation: PatchAddOp,
				Kind:      string(coreType),
				Path:      spec.Name,
			})
		case docs.KindScalar:
			actions = append(actions, NodeAction{
				Operation: PatchSetOp,
				Kind:      string(coreType),
				Path:      spec.Name,
			})
		}
		return
	}
	if spec.Kind == docs.KindScalar {
		for _, a := range fieldsToActions(spec.Children) {
			a.Path = path.Join(spec.Name, a.Path)
			actions = append(actions, a)
		}
	}
	return
}

func fieldsToActions(specs docs.FieldSpecs) []NodeAction {
	var actions []NodeAction
	for _, spec := range specs {
		actions = append(actions, fieldToActions(spec)...)
	}
	return actions
}
