package random

import (
	"crypto/rand"
	"encoding/binary"
)

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

func randCryptoInts(length int) []int32 {
	ints := make([]int32, length)

	for i := range ints {
		var data int32
		err := binary.Read(rand.Reader, binary.BigEndian, &data)
		if err != nil {
			panic("crypto rand failed: " + err.Error())
		}

		ints[i] = data
	}

	return ints
}

// String returns a random string made of numbers, upper-, and lower-case letters
func String(length int) string {
	ar := make([]byte, length, length)
	randInts := randCryptoInts(length)
	alphabetLength := int32(len(alphabet))

	for i := range ar {
		x := randInts[i]
		if x < 0 {
			x = -x
		}
		randIndex := x % alphabetLength
		ar[i] = alphabet[randIndex]
	}

	return string(ar)
}
