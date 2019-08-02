# Webpack critical css extraction plugin

Is used for "semi-automatic" extraction of critical parts from css bundles.

Can work along with [webpack-rtl-plugin](https://github.com/romainberger/webpack-rtl-plugin).

## Installation

```shell
$ npm install webpack-extract-critical-css-plugin
```

## Usage

Add the plugin to your webpack configuration:

```js
const WebpackRTLPlugin = require('webpack-rtl-plugin');
const ExtractCriticalCSSPlugin = require('webpack-extract-critical-css-plugin');

module.exports = {
  entry: path.join(__dirname, 'src/index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  module: {
    loaders: [
      {
        test: /\.css$/,
        loader: ExtractTextPlugin.extract('style-loader', 'css-loader'),
      }
    ],
  },
  plugins: [
    new WebpackRTLPlugin(),
     new ExtractCriticalCSSPlugin({
        minimize: {
            browsers: ['> 1%', 'last 2 versions', 'Firefox >= 20'],
            preset: 'default',
        },
        customMedia: {
            'feed-widget-idea-critical': 'feed-widget-idea-critical'
        },
        minify: !isDev,
        rtlPluginSupport: true,
        rtlOptions: {
            // should be surrounded by dots. E.g. `filename.rtl.css`
            fileNameTag: 'rtl'
        }
    })
  ],
}
```

In your css-module wrap the rule with custom @media, e.g. @media  feed-widget-idea-critical {}
all rules under this mq will be processed to separate css-file. Custom rule will be cut from original chunk

This will create `feed-widget-idea-critical.css`, containing critical css rules.

## Options

```
new ExtractCriticalCSSPlugin({
	minimize: {
		browsers: ['> 1%', 'last 2 versions', 'Firefox >= 20'],
		preset: 'default',
	},
	customMedia: {
		'feed-widget-idea-critical': 'feed-widget-idea-critical'
	},
	minify: !isDev,
	rtlPluginSupport: true,
	rtlOptions: {
		// should be surrounded by dots. E.g. `filename.rtl.css`
		fileNameTag: 'rtl'
	}
})
```

* `minimize` [Array] options will be passed to `cssnano` minimizer.
* `customMedia` [Array], holding map for custom @media-queries to filename, that will be produced for the rules under this query.
* `minify` [boolean] will minify the result
* `rtlPluginSupport` [boolean] will separately parse rtl-versions of chunks
* `rtlOptions` [Array] of options fot rtl support
    * `fileNameTag` [string] 'rtl', by default. an additional part of rtl-version of chunk. E.g. filename.rtl.css
