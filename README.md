# GSolid Plugin for ESBuild

This plugin helps you bundling files using ESBuild. This plugin does not handle Gjs detail for you, you can use [esbuild-gjs](https://github.com/thislight/esbuild-gjs) to handle that.

````js
import * as esbuild from "esbuild";
import GjsPlugin from "esbuild-gjs";
import GSolidPlugin from "esbuild-plugin-gsolid";

await esbuild.build({
  entryPoints: ["index.tsx"],
  target: "firefox68", // Spider Monkey 68
  format: "esm",
  bundle: true,
  outfile: "dest/index.js",
  plugins: [GjsPlugin({}), GSolidPlugin()],
  treeShaking: true,
});
````

## Installation

You must install [babel-preset-solid](https://github.com/solidjs/solid/tree/main/packages/babel-preset-solid) together to use this plugin.

````sh
# NPM:
npm i --save-dev esbuild-plugin-gsolid babel-preset-solid

# PNPM:
pnpm -D esbuild-plugin-gsolid babel-preset-solid

# YARN
yarn add -D esbuild-plugin-gsolid babel-preset-solid
````

## What the plugin do

- Load tsx/jsx files and transform them into JavaScript
- Resolve solid-js package as "solid-js-file" namespace, load files and inject `gsolid/web-ponyfill` into them

## LICENSE
SPDX: Apache-2.0
