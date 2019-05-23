const fs = require('fs');
const clone = require('clone-deep');
const cssnano = require('cssnano');

const webpack = require('webpack');
const wpConfig = require('./webpack.config');

const chai = require('chai');
const expect = chai.expect;
const should = chai.should();

const ExtractCriticalCSSPlugin = require('webpack-extract-critical-css-plugin');

const customMedia = {
	'custom-media-for-module-1': 'custom-css-1',
	'custom-media-for-module-2': 'custom-less-2',
	'custom-media-to-be-splitted-2': 'custom-media-split-less-2',
	'custom-media-modules-pcss-3': 'custom-media-pcss-3',
}

function prepareConfig(customOptions) {
	const options = Object.assign({
		customMedia: customMedia,
		minify: true,
	}, customOptions);
	const config = clone(wpConfig);
	config.plugins.push(new ExtractCriticalCSSPlugin(options));

	return config;
}

function runWPTest(assetName, sampleAssetName, doneFn, customOptions = {}) {
	const config = prepareConfig(customOptions);
	webpack(config, (err, stats) => {
		if (err) {
			throw err;
		}
		const compilation = stats.compilation;
		const assets = compilation.assets;
		const processedAsset = compilation.assets[assetName];
		if (!processedAsset) {
			throw `Asset '${assetName}' not found`;
		}
		const sampleSrc = fs.readFileSync(`./data/sample/${sampleAssetName}`, 'utf-8');
		const processedSrc = processedAsset.source();

		expect(processedSrc).to.equal(sampleSrc);
		doneFn();
	});
}

describe('Init.', () => {
	it('should throw error when no customMedia option is passed', () => {
		const expectedErrMsg = 'webpack-extract-critical-css-plugin. customMedia option is required.';
		try {
			new ExtractCriticalCSSPlugin()
		} catch (e) {
			expect(e).to.equal(expectedErrMsg);
		}
	});
	it('should throw error when empty customMedia option is passed', () => {
		const expectedErrMsg = 'webpack-extract-critical-css-plugin. There should be at least one customMedia option.';
		try {
			new ExtractCriticalCSSPlugin({ customMedia: {} })
		} catch (e) {
			expect(e).to.equal(expectedErrMsg);
		}
	});
});

describe('Critical css split.', () => {
	it('should split critical part from css file', (done) => {
		runWPTest('custom-css-1.css', 'custom-css-1.css', done, { minify: false });
	});
	it('should be able to minify critical css', (done) => {
		runWPTest('custom-css-1.css', 'custom-css-1.min.css', done);
	});
	it('should split critical part from less file', (done) => {
		runWPTest('custom-media-split-less-2.css', 'custom-media-split-less-2.css', done);
	});
	it('should split critical part from pcss file', (done) => {
		runWPTest('custom-media-pcss-3.css', 'custom-media-pcss-3.css', done);
	});
	it('should cut custom media queries from initial assets', (done) => {
		const entry1 = 'entry1.css';
		const entry2 = 'entry2.css';

		const config = prepareConfig();
		return webpack(config, (err, stats) => {
			if (err) {
				throw err;
			}
			const compilation = stats.compilation;
			const assets = compilation.assets;

			const processedAsset1 = compilation.assets[entry1];
			const processedAsset2 = compilation.assets[entry2];
			if (!processedAsset1) {
				throw `Asset '${entry1}' not found`;
			}
			if (!processedAsset2) {
				throw `Asset '${entry2}' not found`;
			}

			Promise.all([
				cssnano.process(processedAsset1.source()),
				cssnano.process(processedAsset2.source()),
			]).then(([processedAssetMinified1, processedAssetMinified2]) => {
				const sampleSrc1 = fs.readFileSync(`./data/sample/${entry1}`, 'utf-8');
				const sampleSrc2 = fs.readFileSync(`./data/sample/${entry2}`, 'utf-8');

				const processedSrc1 = processedAssetMinified1.css;
				const processedSrc2 = processedAssetMinified2.css;

				expect(processedSrc1).to.equal(sampleSrc1);
				expect(processedSrc2).to.equal(sampleSrc2);

				done();
			})
		});
	});
});
