/** SPDX: Apache-2.0 */
import * as esbuild from "esbuild";
import PresetSolid from "babel-preset-solid";
import fs from "fs/promises";
import babel from "@babel/core";
import path from "path";

type GsolidPluginOpts = {};

async function loadTSX(args: esbuild.OnLoadArgs) {
    const buf = await fs.readFile(args.path);
    const result = await esbuild.transform(buf, {
        loader: "tsx",
        target: "esnext",
        jsx: "preserve",
        sourcemap: "inline",
    });
    return {
        contents: result.code,
        warnings: result.warnings,
        pluginData: args.pluginData,
    };
}

const patch = new TextEncoder().encode(`
import {queueMicrotask} from "gsolid/web-ponyfill"
`);

async function transformJSX({
    args,
    contents,
}: {
    args: esbuild.OnLoadArgs;
    contents: string;
}): Promise<esbuild.OnLoadResult> {
    const babelOptions = babel.loadOptions({
        presets: [
            [
                PresetSolid,
                {
                    moduleName: "gsolid/jsx-runtime",
                    generate: "universal",
                },
            ],
        ],
        filename: args.path,
        caller: {
            name: "esbuild-plugin-gsolid",
            supportsStaticESM: true,
        },
    }) as any;
    if (!babelOptions) return { contents };

    if (babelOptions?.sourceMaps) {
        const filename = path.relative(process.cwd(), args.path);

        babelOptions.sourceFileName = filename;
    }
    try {
        const result = await babel.transformAsync(contents, babelOptions);
        if (!result) {
            throw Error("babel is failed sliently");
        }
        return {
            contents: result.code || undefined,
        };
    } catch (detail) {
        return {
            errors: [
                {
                    detail,
                    location: {
                        file: args.path,
                    },
                },
            ],
        };
    }
}

const UniqueKey = Symbol("esbuild-plugin-gsolid");

export default function (): esbuild.Plugin {
    return {
        name: "gsolid",
        setup(build) {
            const opts = build.initialOptions;
            if (typeof opts.jsx == "undefined") {
                opts.jsx = "preserve";
                if (typeof opts.jsxImportSource == "undefined") {
                    opts.jsxImportSource = "gsolid";
                }
            }

            build.onResolve({ filter: /^solid-js\/?/ }, async (args) => {
                if (
                    typeof args.pluginData == "object" &&
                    args.pluginData[UniqueKey] &&
                    args.pluginData[UniqueKey].skip
                ) {
                    return;
                }
                const resolved = await build.resolve(args.path, {
                    importer: args.importer,
                    kind: args.kind,
                    pluginData: {
                        [UniqueKey]: { skip: true },
                    },
                    resolveDir: args.resolveDir || path.dirname(args.importer),
                });
                return {
                    path: resolved.path,
                    namespace: "solid-js-file",
                    warnings: resolved.warnings,
                    errors: resolved.errors,
                };
            });

            // Force to resolve gsolid/web-ponyfill imports (in solid-js-file:*)
            // to current node_modules gsolid
            build.onResolve(
                { filter: /^gsolid\/web-ponyfill$/, namespace: "solid-js-file" },
                async (args) => {
                    if (
                        typeof args.pluginData == "object" &&
                        args.pluginData[UniqueKey] &&
                        args.pluginData[UniqueKey].skip
                    ) {
                        return;
                    }
                    const resolved = await build.resolve(
                        "gsolid/web-ponyfill",
                        {
                            importer: args.importer,
                            kind: args.kind,
                            resolveDir: ".",
                            namespace: "file",
                            pluginData: {
                                [UniqueKey]: {skip: true}
                            }
                        }
                    );
                    return {
                        path: resolved.path,
                        namespace: "file",
                        warnings: resolved.warnings,
                        errors: resolved.errors,
                    };
                }
            );

            build.onLoad(
                { filter: /.*/, namespace: "solid-js-file" },
                async (args) => {
                    const content = await fs.readFile(args.path);
                    const mergedContent = new Uint8Array(
                        patch.length + content.length
                    );
                    mergedContent.set(patch);
                    mergedContent.set(content, patch.length);
                    return {
                        contents: mergedContent,
                        watchFiles: [args.path],
                        resolveDir: path.dirname(args.path),
                    };
                }
            );

            build.onLoad(
                { filter: /\.(t|j)sx$/, namespace: "file" },
                async (args) => {
                    const isTSX = args.path.endsWith(".tsx");
                    let jsxContent: string | Uint8Array;
                    const warnings: esbuild.Message[] = [];
                    if (isTSX) {
                        const pluginRet = await loadTSX(args);
                        for (const warn of pluginRet.warnings) {
                            warnings.push(warn);
                        }
                        jsxContent = pluginRet.contents;
                    } else {
                        jsxContent = await fs.readFile(args.path, {
                            encoding: "utf-8",
                        });
                    }
                    const ret = await transformJSX({
                        args,
                        contents: jsxContent,
                    });
                    ret.warnings = [...(ret.warnings || []), ...warnings];
                    ret.watchFiles = [args.path];
                    return ret;
                }
            );
        },
    };
}
