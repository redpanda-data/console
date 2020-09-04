//
// Usage (dev):
//  npx ts-node src/utils/interpreter/findFunction.test.ts
//
// Usage (build):
// npm run test-interpreter-code
//

import { expect, expectEq, expectRefEq, successfulTests } from './helpers';
import './global';
require('./findFunction');

declare global {
    function find(propName: string, ignoreCase?: boolean): any;
    function find(isMatch: (obj: object | Array<any>, key: string) => boolean): any;
    function findAll(propName: string, ignoreCase?: boolean): any[];
    function findAll(isMatch: (obj: object | Array<any>, key: string) => boolean): any[];

    interface Object {
        find(propName: string, ignoreCase?: boolean): any;
        find(isMatch: (obj: object | Array<any>, key: string) => boolean): any;
        findAll(propName: string, ignoreCase?: boolean): any[];
        findAll(isMatch: (obj: object | Array<any>, key: string) => boolean): any[];
    }
}


console.log('running "findFunction" tests...');
global.value = {
    name: "n1",
    score: "s1",
    subObj: {
        name: "n2",
        score: 1,
    },
    ar: [
        { name: "n3", score: 2, team: 1 },
        { name: "n4", score: "4 stars", team: 1 },
        { name: "n5", score: "3 stars", team: 2 },
        { name: "n6", score: { stars: 10, points: 123 }, team: 'red' },
    ]
};




expect(() => find('name') == 'n1');
expect(() => find('sCoRe', true) == 's1');
expect(() => find('subObj') != null);

const subObj = find('subObj') as object;
expect(() => subObj != null);
expect(() => subObj.find('score') === 1);
expect(() => subObj.find((obj, prop) => prop == 'score') === 1);
expect(() => subObj.find((obj, prop) => false) === undefined);
expect(() => subObj.find('asdasfa') === undefined);


// expectRefEq({
//     name: "can find array",
//     actual: find('ar'),
//     expected: value.ar
// })

// expect(() => {
//     find({ name: 'n3' }).score === 2
// })

console.log('');
console.log('---');
console.log(`Success! ${successfulTests} tests completed!`);
console.log('---');
console.log('');
