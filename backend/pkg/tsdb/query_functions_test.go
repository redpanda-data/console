package tsdb

import (
	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/nakabonne/tstorage"
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
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}

func TestRate_StaticSeriesWithGaugeDrop(t *testing.T) {
	input := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     100,
		},
		{
			Timestamp: 105,
			Value:     105,
		},
		{
			Timestamp: 110,
			Value:     110,
		},
		{
			Timestamp: 115,
			Value:     100,
		},
		{
			Timestamp: 120,
			Value:     105,
		},
		{
			Timestamp: 130,
			Value:     115,
		},
	}
	expected := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     1,
		},
		{
			Timestamp: 105,
			Value:     1,
		},
		{
			Timestamp: 110,
			Value:     1,
		},
		{
			Timestamp: 115,
			Value:     1,
		},
		{
			Timestamp: 120,
			Value:     1,
		},
		{
			Timestamp: 130,
			Value:     math.NaN(),
		},
	}

	actual := rate(input, 10*time.Second)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
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
			Value:     1,
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
			Value:     math.NaN(),
		},
	}

	actual := rate(input, 10*time.Second)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}

func TestRate_GrowingSeriesWonkyTimestamps(t *testing.T) {
	input := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     100,
		},
		{
			Timestamp: 105,
			Value:     105,
		},
		{
			Timestamp: 120,
			Value:     120,
		},
		{
			Timestamp: 122,
			Value:     122,
		},
		{
			Timestamp: 132,
			Value:     132,
		},
		{
			Timestamp: 138,
			Value:     138,
		},
	}
	expected := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     1,
		},
		{
			Timestamp: 105,
			Value:     math.NaN(),
		},
		{
			Timestamp: 120,
			Value:     1,
		},
		{
			Timestamp: 122,
			Value:     1,
		},
		{
			Timestamp: 132,
			Value:     1,
		},
		{
			Timestamp: 138,
			Value:     math.NaN(),
		},
	}

	actual := rate(input, 10*time.Second)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}

func TestRate_GrowingSeriesDifferentRateValues(t *testing.T) {
	input := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     100,
		},
		{
			Timestamp: 105,
			Value:     110,
		},
		{
			Timestamp: 115,
			Value:     160,
		},
		{
			Timestamp: 122,
			Value:     160,
		},
		{
			Timestamp: 132,
			Value:     170,
		},
		{
			Timestamp: 138,
			Value:     180,
		},
		{
			Timestamp: 140,
			Value:     194,
		},
	}
	expected := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     4,
		},
		{
			Timestamp: 105,
			Value:     5,
		},
		{
			Timestamp: 115,
			Value:     0,
		},
		{
			Timestamp: 122,
			Value:     1,
		},
		{
			Timestamp: 132,
			Value:     3,
		},
		{
			Timestamp: 138,
			Value:     7,
		},
		{
			Timestamp: 140,
			Value:     math.NaN(),
		},
	}

	actual := rate(input, 15*time.Second)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}
