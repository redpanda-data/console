export function filterConverter(code: string) {
    if (code.includes('findProp')) {
        const regexFindPropGlobal = /findProp\('(.*?)'\)/g;
        const regexFindProp = /findProp\('(.*?)'\)/;

        // Find the group of occurrences
        const findPropOccurences = code.match(regexFindPropGlobal) || [];

        findPropOccurences.forEach(occurence => {
            // Extract the attributes or keys from the string
            const keysMatch = occurence.match(regexFindProp) || [];
            const keys = keysMatch[1] && keysMatch[1].split('.') || [];

            // Map it from 'key.key' into ['key']['key']
            const replacedKeys = keys.map(key => `['${key}']`);
            const replacedString = `value${replacedKeys.join('')}`;

            // Replace the code with the replaced string 
            // From: findProp('key.key')
            // To: value['key']['key']
            code = code.replace(occurence, replacedString);
        });
    }

    return code.includes('return ') ? code : 'return (' + code + ')';
}