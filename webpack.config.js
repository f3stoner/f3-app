import path from "node:path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import Dotenv from "dotenv-webpack";
import CopyPlugin from "copy-webpack-plugin";

export default {
    mode: "development",
    entry: "./src/index.js",
    output: {
        filename: "[name].[contenthash].js",
        path: path.resolve(import.meta.dirname, "dist"),
        clean: true,
        publicPath: "/f3-app/",
    },
    devtool: "eval-source-map",
    devServer: {
        static: "./public",
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