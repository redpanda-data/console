package tsdb

import (
	"github.com/nakabonne/tstorage"
	"github.com/stretchr/testify/assert"
	"math"
	"testing"
	"time"
)

func TestRate_StaticSeries(t *testing.T) {
	input := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     100,
		},
		{
			Timestamp: 110,
			Value:     100,
		},
		{
			Timestamp: 120,
			Value:     100,
		},
		{
			Timestamp: 130,
			Value:     100,
		},
	}
	expected := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     0,
		},
		{
			Timestamp: 110,
			Value:     0,
		},
		{
			Timestamp: 120,
			Value:     0,
		},
		{
			Timestamp: 130,
			Value:     math.NaN(),
		},
	}

	actual := rate(input, 10*time.Second)
	assert.Equal(t, expected, actual)
}

func TestRate_GrowingSeries(t *testing.T) {
	input := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     100,
		},
		{
			Timestamp: 110,
			Value:     110,
		},
		{
			Timestamp: 120,
			Value:     120,
		},
		{
			Timestamp: 130,
			Value:     130,
		},
	}
	expected := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     math.NaN(),
		},
		{
			Timestamp: 110,
			Value:     1,
		},
		{
			Timestamp: 120,
			Value:     1,
		},
		{
			Timestamp: 130,
			Value:     1,
		},
	}

	actual := rate(input, 10*time.Second)
	assert.Equal(t, expected, actual)
}
