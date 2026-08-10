import path from "node:path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import Dotenv from "dotenv-webpack";
import CopyPlugin from "copy-webpack-plugin";
import webpack from "webpack";
import { InjectManifest } from "workbox-webpack-plugin";

export default (env, argv) => {
    const isProd = argv.mode === "production";
    const buildId = new Date().toISOString();
    const publicPath = isProd ? "/f3-app/" : "/";

    return {
        mode: argv.mode || "development",
        entry: "./src/index.js",
        output: {
            filename: "[name].[contenthash].js",
            chunkFilename: "[name].[contenthash].js",
            path: path.resolve(import.meta.dirname, "dist"),
            clean: true,
            publicPath,
        },
        devtool: isProd ? false : "eval-source-map",
        devServer: {
            host: "0.0.0.0",
            port: 8080,
            static: {
                directory: path.resolve(import.meta.dirname, "public"),
            },
            historyApiFallback: true,
            allowedHosts: "all",
        },
        plugins: [
            new webpack.DefinePlugin({
                __BUILD_ID__: JSON.stringify(buildId),
            }),
            new HtmlWebpackPlugin({
                template: "./index.html",
                templateParameters: {
                    publicPath,
                },
            }),
            new CopyPlugin({
                patterns: [{ from: "public", to: "" }],
            }),
            ...(isProd
                ? [
                    new InjectManifest({
                        swSrc: "./src/sw.js",
                        swDest: "sw.js",
                        exclude: [/\.LICENSE\.txt$/],
                        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
                    }),
                ]
                : []),
            new Dotenv(),
        ],
        module: {
            rules: [
                {
                    test: /\.css$/i,
                    use: ["style-loader", "css-loader"],
                },
            ],
        },
    };
};