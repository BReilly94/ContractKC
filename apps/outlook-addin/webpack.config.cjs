// CommonJS webpack config — Office Add-in tooling expects CJS at the root.
// Bundles the taskpane and the command host as two separate entry chunks and
// emits them under `dist/` with a copied-over `taskpane.html`, `commands.html`,
// `taskpane.css`, `manifest.xml`, and static `assets/`.

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

/**
 * @param {Record<string, unknown>} _env
 * @param {{ mode?: 'production' | 'development' }} argv
 */
module.exports = (_env, argv) => {
  const isProd = argv.mode === 'production';
  return {
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    entry: {
      taskpane: './src/taskpane/taskpane.tsx',
      commands: './src/commands/commands.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        __API_BASE_URL__: JSON.stringify(
          process.env.CKB_API_BASE_URL ?? 'http://localhost:4000',
        ),
        __AUTH_MODE__: JSON.stringify(process.env.CKB_AUTH_MODE ?? 'local-dev'),
      }),
      new HtmlWebpackPlugin({
        filename: 'taskpane.html',
        template: './src/taskpane/taskpane.html',
        chunks: ['taskpane'],
      }),
      new HtmlWebpackPlugin({
        filename: 'commands.html',
        template: './src/commands/commands.html',
        chunks: ['commands'],
      }),
      new CopyPlugin({
        patterns: [
          { from: 'src/taskpane/taskpane.css', to: 'taskpane.css' },
          { from: 'manifest.xml', to: 'manifest.xml' },
          { from: 'public/assets', to: 'assets', noErrorOnMissing: true },
        ],
      }),
    ],
    devServer: {
      static: { directory: path.resolve(__dirname, 'dist') },
      server: 'https',
      port: 3010,
      hot: false,
      historyApiFallback: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
  };
};
