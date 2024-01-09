import { NextFederationPlugin } from "@module-federation/nextjs-mf";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optionally, add any other Next.js config below
  reactStrictMode: true,
  distDir: "build", // To match CRA config, set it to `build`
  swcMinify: true,
  output: "export",
  images: {
    // Required to properly export HTML files
    unoptimized: true,
  },
  experimental: {
    // Optimize how packages get loaded in dev mode
    optimizePackageImports: ["@redpanda-data/ui", "react-bootstrap", "react-icons", "lodash", "@chakra-ui/react", "@chakra-ui/form-control", "@chakra-ui/icon", "@chakra-ui/layout", "@chakra-ui/media-query", "@chakra-ui/menu", "@chakra-ui/spinner", "@chakra-ui/styled-system", "@chakra-ui/system", "@mui/material", "date-fns", "antd"],
  },
  webpack: (config) => {
    config.plugins.push(
      /**
       * Module Federation for NextJS only works well in Pages Router
       * https://github.com/module-federation/module-federation-examples/issues/3151#issuecomment-1720250040
       */
      new NextFederationPlugin({
        name: "rp_console",
        filename: "static/chunks/embedded.js",
        exposes: {
          // specify exposed pages and components
          "./EmbeddedApp": "./src/EmbeddedApp",
          "./injectApp": "./src/injectApp",
          "./config": "./src/config.ts",
        },
      })
    );

    /**
     * Allow the .js extension in import paths when importing TypeScript files.
     * It is the standard for ECMAScript modules, but not all bundlers have
     * caught up yet.
     * Alternatively, add the plugin option `import_extension=none` in buf.gen.yaml.
     * Required for App
     */
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        ".js": [".ts", ".js"],
      },
    };

    /**
     * Required because we use pages router, which does not allow importing CSS directly from our @redpanda-data/ui library.
     * https://github.com/vercel/next.js/discussions/27953#discussioncomment-3616403
     */
    config.module?.rules
      .find((rule) => rule.oneOf)
      .oneOf.forEach((rule) => {
        if (rule.issuer?.and?.[0]?.toString().includes("_app")) {
          const and = rule.issuer.and;
          rule.issuer.or = [/[\\/]node_modules[\\/]@redpanda-data[\\/]/, { and }];
          delete rule.issuer.and;
        }
      });

    return config;
  },
};

export default nextConfig;
