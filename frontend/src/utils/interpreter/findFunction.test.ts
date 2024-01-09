/* eslint-disable no-restricted-globals */

/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import './global';
import { expect, expectEq } from './helpers';
require('./findFunction');

declare global {
    function find(propName: string, ignoreCase?: boolean): any;
    function find(isMatch: (obj: object | Array<any>, key: string) => boolean): any;
    function find(pattern: object, ignoreCase?: boolean): any;
    function findAll(propName: string, ignoreCase?: boolean): any[];
    function findAll(isMatch: (obj: object | Array<any>, key: string) => boolean): any[];
    function findAll(pattern: object, ignoreCase?: boolean): any[];

    interface Object {
        find(propName: string, ignoreCase?: boolean): any;
        find(isMatch: (obj: object | Array<any>, key: string) => boolean): any;
        find(pattern: object, ignoreCase?: boolean): any;
        findAll(propName: string, ignoreCase?: boolean): any[];
        findAll(isMatch: (obj: object | Array<any>, key: string) => boolean): any[];
        findAll(pattern: object, ignoreCase?: boolean): any[];
    }
}

describe('findFunction', () => {    
    global.value = {
        name: 'n1',
        score: 's1',
        nested: {
            name: 'n2',
            score: 1,
        },
        ar: [
            { name: 'n3', score: 2, team: 1 },
            { name: 'n4', score: '4 stars', team: 1 },
            { name: 'n5', score: '3 stars', team: 2 },
            { name: 'n6', score: { stars: 10, points: 123 }, team: 'red' },
        ]
    };
    
    test('find by name', () => {
        expect(() => find('name') == 'n1');
        expect(() => find('sCoRe', true) == 's1');
        expect(() => find('asdaadf') === undefined);
        expect(() => find('stars') === 10);
        expect(() => find('points') === 123);
        expect(() => find('TEAM', true) === 1);
        expect(() => find('TEAM', false) === undefined);
        expect(() => find('TEAM') === undefined);
        expect(() => find('team', true) === 1);
        expect(() => find('team', false) === 1);
        expect(() => find('team') === 1);
        expect(() => typeof find('nested') === 'object');
    })
    
    test('find on nested object', () => {
        const nested = find('nested') as object;
        expect(() => nested != null);
        expect(() => nested.find('score') === 1);
        expect(() => nested.find((_, prop) => prop == 'score') === 1);
        expect(() => nested.find(() => false) === undefined);
        expect(() => nested.find('asdasfa') === undefined);
    })
    
    test('find by pattern', () => {
        expect(() => find({ name: 'n2' }).score === 1);
        expect(() => find({ score: '4 stars' }).name === 'n4');
        expect(() => find({ team: 'red' }).score.stars === 10);
        expectEq({
            name: 'findAll pattern equality',
            actual: findAll({ team: 1 }),
            expected: [global.value.ar[0], global.value.ar[1]],
        });
        
    })
    
})
