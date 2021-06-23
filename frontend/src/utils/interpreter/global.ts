
/*eslint @typescript-eslint/no-namespace: off */

declare namespace NodeJS {
    interface Global {
        value: any;
    }
}

global.value = {};