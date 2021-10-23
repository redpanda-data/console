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

func TestRate_ScaleDownDatapoints(t *testing.T) {
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
			Value:     115,
		},
		{
			Timestamp: 120,
			Value:     120,
		},
		{
			Timestamp: 125,
			Value:     125,
		},
		{
			Timestamp: 130,
			Value:     130,
		},
	}
	expected := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     100,
		},
		{
			Timestamp: 115,
			Value:     115,
		},
		{
			Timestamp: 130,
			Value:     130,
		},
	}

	actual := scaleDown(input, 3)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}

func TestRate_ScaleDownManyDatapoints(t *testing.T) {
	input := make([]*tstorage.DataPoint, 1515)
	for i := 0; i < 1515; i++ {
		input[i] = &tstorage.DataPoint{
			Value:     float64(i * 10),
			Timestamp: int64(i),
		}
	}
	expected := []*tstorage.DataPoint{
		input[0],
		input[168],
		input[336],
		input[504],
		input[672],
		input[840],
		input[1008],
		input[1176],
		input[1345],
		input[1514],
	}

	actual := scaleDown(input, 10)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}

func TestRate_ScaleDownDatapointsWithTooMuchDistance(t *testing.T) {
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
		// Here's a big gap in time!
		{
			Timestamp: 150,
			Value:     150,
		},
		{
			Timestamp: 160,
			Value:     160,
		},
		{
			Timestamp: 170,
			Value:     170,
		},
		{
			Timestamp: 180,
			Value:     180,
		},
		{
			Timestamp: 190,
			Value:     190,
		},
		{
			Timestamp: 200,
			Value:     200,
		},
	}
	expected := []*tstorage.DataPoint{
		{
			Timestamp: 100,
			Value:     100,
		},
		{
			Timestamp: 110,
			Value:     110,
		},
		// Here's a big gap in time!
		{
			Timestamp: 150,
			Value:     150,
		},
		{
			Timestamp: 160,
			Value:     160,
		},
		{
			Timestamp: 180,
			Value:     180,
		},
		{
			Timestamp: 200,
			Value:     200,
		},
	}

	actual := scaleDown(input, 6)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}

func TestCreateTimestamps(t *testing.T) {
	expected := make([]int64, 51)
	counter := 0
	for i := 0; i <= 500; i += 10 {
		expected[counter] = int64(i)
		counter++
	}

	actual := createTimestamps(0, 500, 51)
	if diff := cmp.Diff(expected, actual, cmp.AllowUnexported(), cmpopts.EquateNaNs()); diff != "" {
		t.Error(diff)
	}
}
