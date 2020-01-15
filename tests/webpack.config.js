const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const webpack = require('webpack');

function createStylesLoader(options) {
	options = options || {};

	const css = {
		loader: 'css-loader',
		options: {
			// autoprefixer: true,
			// context: staticDirectory(),
			modules: options.cssModules ? {
				mode: 'local',
				localIdentName: '[name]__[local]--[hash:base64:5]',
			} : false,
			importLoaders: options.cssModules ? 1 : 0,
		}
	};

	const postCss = {
		loader: 'postcss-loader',
		options: {
			config: {
				// Same location as the default.
				// A workaround for ./deployment/Makefile
				path: __dirname
			}
		}
	};

	const less = {
		loader: 'less-loader',
		// options: {
		// 	root: staticDirectory()
		// }
	};

	return [
		MiniCssExtractPlugin.loader,
		css,
	].concat(
		options.pcss !== false ? [postCss] : [],
		options.less ? [less] : []
	);
}

module.exports = {
	mode: 'development',
	devtool: false,
	entry: {
		entry1: './data/entry1',
		entry3: './data/entry3'
	},
	output: {
		path: __dirname + '/dist',
		// filename: filesWithoutHash ? '[name].js' : '[name].[contenthash].js',
		// chunkFilename: filesWithoutHash ? '[name].js' : '[name].[contenthash].js',
		// pathinfo: false,
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: createStylesLoader(),
			},
			{
				test: /\.less$/,
				oneOf: [
					{
						resourceQuery: /module/, // foo.less?module
						use: createStylesLoader({less: true, cssModules: true})
					},
					{
						loader: createStylesLoader({less: true})
					},
				],
				sideEffects: true
			},
			{
				test: /\.pcss$/,
				use: createStylesLoader({cssModules: true}),
				sideEffects: true
			},
		]
	},
	plugins: [
		new webpack.NamedChunksPlugin(),
		new webpack.HashedModuleIdsPlugin(),
		new MiniCssExtractPlugin({
			filename: '[name].css',
			chunkFilename: '[id].css',
		})
	],
	resolve: {
		extensions: ['*', '.js'],
	}
};
