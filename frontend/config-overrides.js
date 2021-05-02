
const { override, fixBabelImports } = require('customize-cra');


module.exports = override(

    // fixBabelImports('import', {
    //     libraryName: 'antd',
    //     libraryDirectory: 'es',
    //     style: true,
    // }),

    // todo: to really get the dark theme working correctly we'll need
    // to fix a lot of stuff related to styling...
    // move inline styles out, invert stuff like #fff, ...
    // addLessLoader({
    //     javascriptEnabled: true,
    //     modifyVars: darkTheme.default
    // }),
);