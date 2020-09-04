
declare module NodeJS {
    interface Global {
        value: any;
    }
}

global.value = {};