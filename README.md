# Webpack critical css extraction plugin

Is used for "semi-automatic" extraction of critical parts from css bundles.

## Installation

```shell
$ npm install webpack-extract-critical-css-plugin
```

## Usage

Add the plugin to your webpack configuration:

```js
const ExtractCriticalCSSPlugin = require('webpack-extract-critical-css-plugin');

module.exports = {
  entry: path.join(__dirname, 'src/index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  ...
  plugins: [
     new ExtractCriticalCSSPlugin({
        customMedia: {
            'feed-widget-idea-critical': 'feed-widget-idea-critical'
        },
        minimize: {
            browsers: ['> 1%', 'last 2 versions', 'Firefox >= 20'],
            preset: 'default',
        },
        rtlSupport: true,
        rtlOptions: {
            // should be surrounded by dots. E.g. `filename.rtl.css`
            fileNameTag: 'rtl',
            rtlcssOptions: {},
        }
    })
  ],
}
```

In your css-module wrap the rule with custom @media, e.g. @media  feed-widget-idea-critical {}
all rules under this mq will be processed to separate css-file. Custom rule will be cut from original chunk

This will create `feed-widget-idea-critical.css`, containing critical css rules.

## Options

* `customMedia` [Array], required, holding map for custom @media-queries to filename, that will be produced 
* `minimize` [Array] options will be passed to `cssnano` minimizer.
for the rules under this query.
* `rtlSupport` [boolean] will separately parse rtl-versions of chunks
* `rtlOptions` [Array] of options fot rtl support
    * `fileNameTag` [string] 'rtl', by default. an additional part of rtl-version of chunk. E.g. filename.rtl.css . If custom media is 'critical-styles' two files will be produced: `critical-styles.css` and `critical-styles.rtl.css`,
    * `rtlcssOptions` [Object] options, that will be passed to `rtlcss` processor
