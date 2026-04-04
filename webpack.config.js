import path from "node:path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import Dotenv from "dotenv-webpack";
import CopyPlugin from "copy-webpack-plugin";

export default (env, argv) => {
    const isProd = argv.mode === "production";
    return {
    mode: argv.mode || "development",
    entry: "./src/index.js",
    output: {
        filename: "[name].[contenthash].js",
        path: path.resolve(import.meta.dirname, "dist"),
        clean: true,
        publicPath: isProd ? "/f3-app/" : "/",
    },
    devtool: "eval-source-map",
    devServer: {
        static:  {
            directory: path.resolve(import.meta.dirname, "public"),
        },
        historyApiFallback: true,
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: "./index.html",
        }),
        new CopyPlugin({
            patterns: [
                { from: "public", to: "" },
            ],
        }),
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
}