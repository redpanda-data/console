/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

const colors = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Blue',
  'Indigo',
  'Violet',
  'Purple',
  'Teal',
  'Scarlet',
  'Crimson',
  'Magenta',
  'Amber',
  'Gold',
  'Silver',
];

const habitats = [
  'Marine',
  'Desert',
  'Arctic',
  'Forest',
  'Woodland',
  'Tropical',
  'Volcanic',
  'Urban',
  'Suburban',
  'City',
  'Space',
];

const animals = [
  'Squirrel',
  'Dog',
  'Cat',
  'Chimp',
  'Ox',
  'Lion',
  'Panda',
  'Walrus',
  'Otter',
  'Mouse',
  'Kangaroo',
  'Goat',
  'Horse',
  'Monkey',
  'Cow',
  'Koala',
  'Elephant',
  'Leopard',
  'Hippo',
  'Giraffe',
  'Fox',
  'Coyote',
  'Hedgehog',
  'Sheep',
  'Deer',
  'Camel',
  'Starfish',
  'Alligator',
  'Owl',
  'Tiger',
  'Bear',
  'Whale',
  'Raccoon',
  'Wolf',
  'Dolphin',
  'Empanada',
];

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getRandomAnimalName(): string {
  const sections = [colors, habitats, animals];
  return sections
    .map((section) => section[getRandomInt(0, section.length - 1)])
    .join('-')
    .toLowerCase();
}
