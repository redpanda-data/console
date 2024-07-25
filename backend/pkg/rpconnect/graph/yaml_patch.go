package graph

// PatchOperation describes an operation to apply for a config patch.
type PatchOperation string

// Various patch operation types
const (
	PatchAddOp     PatchOperation = "add"
	PatchAddFromOp PatchOperation = "add from"
	PatchDeleteOp  PatchOperation = "delete"
	PatchSetOp     PatchOperation = "set"
	PatchReplaceOp PatchOperation = "replace"
	PatchCopyOp    PatchOperation = "copy"
	PatchMoveAbove PatchOperation = "move above"
	PatchMoveBelow PatchOperation = "move below"
)
