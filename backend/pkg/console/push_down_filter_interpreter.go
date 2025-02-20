// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"time"

	"github.com/dop251/goja"

	"github.com/redpanda-data/console/backend/pkg/interpreter"
)

type interpreterArguments struct {
	PartitionID   int32
	Offset        int64
	Timestamp     time.Time
	Key           any
	Value         any
	HeadersByKey  map[string][]byte
	KeySchemaID   *uint32
	ValueSchemaID *uint32
}

type isMessageOkFunc = func(args interpreterArguments) (bool, error)

// SetupInterpreter initializes the JavaScript interpreter along with the given JS code. It returns a wrapper function
// which accepts all Kafka message properties (offset, key, value, ...) and returns true (message shall be returned) or false
// (message shall be filtered).
func (*Service) setupInterpreter(interpreterCode string) (isMessageOkFunc, error) {
	// In case there's no code for the interpreter let's return a dummy function which always allows all messages
	if interpreterCode == "" {
		return func(_ interpreterArguments) (bool, error) { return true, nil }, nil
	}

	vm := goja.New()
	code := fmt.Sprintf(`var isMessageOk = function() {%s}`, interpreterCode)
	_, err := vm.RunString(code)
	if err != nil {
		return nil, fmt.Errorf("failed to compile given interpreter code: %w", err)
	}

	// Make find() function available inside of the JavaScript VM
	_, err = vm.RunString(interpreter.FindFunction)
	if err != nil {
		return nil, fmt.Errorf("failed to compile findFunction: %w", err)
	}

	// We use named return parameter here because this way we can return a error message in recover().
	// Returning a proper error is important because we want to stop the consumer for this partition
	// if we exceed the execution timeout.
	isMessageOk := func(args interpreterArguments) (isOk bool, err error) {
		// 1. Setup timeout check. If execution takes longer than 400ms the VM will be killed
		// Ctx is used to notify the below go routine once we are done
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		// Send interrupt signal to VM if execution has taken too long
		go func() {
			timer := time.NewTimer(400 * time.Millisecond)

			select {
			case <-timer.C:
				vm.Interrupt("timeout after 400ms")
				return
			case <-ctx.Done():
				return
			}
		}()

		// Call Javascript function and check if it could be evaluated and whether it returned true or false
		vm.Set("partitionID", args.PartitionID)
		vm.Set("offset", args.Offset)
		tsVal, err := vm.New(vm.Get("Date").ToObject(vm), vm.ToValue(args.Timestamp.UnixNano()/1e6))
		if err != nil {
			vm.Set("timestamp", args.Timestamp)
		} else {
			vm.Set("timestamp", tsVal)
		}
		vm.Set("key", args.Key)
		vm.Set("value", args.Value)
		vm.Set("headers", args.HeadersByKey)

		if args.KeySchemaID != nil {
			vm.Set("keySchemaID", *args.KeySchemaID)
		}

		if args.ValueSchemaID != nil {
			vm.Set("valueSchemaID", *args.ValueSchemaID)
		}

		isOkRes, err := vm.RunString("isMessageOk()")
		if err != nil {
			return false, fmt.Errorf("failed to evaluate javascript code: %w", err)
		}

		return isOkRes.ToBoolean(), nil
	}

	return isMessageOk, nil
}
