const fs = require('fs');
const clone = require('clone-deep');
const cssnano = require('cssnano');

const webpack = require('webpack');
const wpConfig = require('./webpack.config');

const chai = require('chai');
const expect = chai.expect;
const should = chai.should();

const ExtractCriticalCSSPlugin = require('webpack-extract-critical-css-plugin');

const OPTIONS_VALIDATION_ERR_REQUIRED_MSG = `webpack-extract-critical-css-plugin. 'customMedia' option is required and should be an object (str: str)`;
const OPTIONS_VALIDATION_ERR_ILLEGAL_MSG = `webpack-extract-critical-css-plugin. 'customMedia' option must be an object (str: str)`;

const customMedia = {
	'custom-media-for-module-1': 'custom-css-1',
	'custom-media-for-module-2': 'custom-less-2',
	'custom-media-to-be-splitted-2': 'custom-media-split-less-2',
	'custom-media-modules-pcss-3': 'custom-media-pcss-3',
	'custom-media-for-rtl': 'custom-media-for-rtl',
};

function preparePlugin(customOptions = {}) {
	const options = Object.assign({
		customMedia: customMedia,
	}, customOptions);

	return new ExtractCriticalCSSPlugin(options);
}

function prepareConfig(plugin = null, entry = null) {
	const config = clone(wpConfig);
	if (entry !== null) {
		config.entry = entry;
	}

	config.plugins.push(plugin);

	return config;
}

function runWPTest(assetName, sampleAssetName, doneFn, customOptions = {}) {
	const config = prepareConfig(preparePlugin(customOptions));
	webpack(config, (err, stats) => {
		if (err) {
			throw err;
		}
		const processedAsset = stats.compilation.assets[assetName];
		if (!processedAsset) {
			throw `Asset '${assetName}' not found`;
		}
		const sampleSrc = fs.readFileSync(`./data/sample/${sampleAssetName}`, 'utf-8');
		const processedSrc = processedAsset.source();

		expect(processedSrc).to.equal(sampleSrc);
		doneFn();
	});
}

function runWPWatchMode(entry, additionalContent, firstRunAssertion, finalCallback) {
	const plugin = preparePlugin({
		debug: true,
	});
	const config = prepareConfig(plugin, entry);
	const compiler = webpack(config);
	let nRun = 0;
	const watcher = compiler.watch({
		aggregateTimeout: 1,
		poll: false,
	}, function (err, stats) {
		if (err) {
			throw err;
		}
		nRun++;
		// Somehow webpack in `watch` mode generates hashes for chunks modules several times.
		// although their content is not changing, hashes vary. First time hash is not
		// correct, so we skip it.
		if (nRun === 1) {
			const modifiedChunks = plugin.getModifiedChunks();
			modifiedChunks.splice(0, modifiedChunks.length);
			return;
		}
		if (nRun === 2) {
			const modifiedChunks = plugin.getModifiedChunks();
			firstRunAssertion(modifiedChunks);

			fs.writeFileSync('./data/entry1_tmp.js', additionalContent, {flag: 'a'});

			return;
		}

		watcher.close();

		finalCallback(plugin.getModifiedChunks())
	});
}

describe('Init.', () => {
	it('should throw error when no customMedia option is passed', () => {
		const createPlugin = () => {
			new ExtractCriticalCSSPlugin()
		};
		expect(createPlugin).to.throw(OPTIONS_VALIDATION_ERR_REQUIRED_MSG);
	});
	it('should throw error when empty customMedia option is passed', () => {
		const createPlugin = () => {
			new ExtractCriticalCSSPlugin({customMedia: {}})
		};
		expect(createPlugin).to.throw(OPTIONS_VALIDATION_ERR_ILLEGAL_MSG);
	});
	it('should throw error when illegal customMedia option is passed', () => {
		const createPlugin = () => {
			new ExtractCriticalCSSPlugin({
				customMedia: {
					'one': 1
				}
			})
		};
		expect(createPlugin).to.throw(OPTIONS_VALIDATION_ERR_ILLEGAL_MSG);
	});
});

describe('Critical css split.', () => {
	it('should split critical part from css file', (done) => {
		runWPTest('custom-css-1.css', 'custom-css-1.css', done, {minify: false});
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
		const entry3 = 'entry3.css';

		const config = prepareConfig(preparePlugin());
		return webpack(config, (err, stats) => {
			if (err) {
				throw err;
			}

			const processedAsset1 = stats.compilation.assets[entry1];
			const processedAsset2 = stats.compilation.assets[entry3];
			if (!processedAsset1) {
				throw `Asset '${entry1}' not found`;
			}
			if (!processedAsset2) {
				throw `Asset '${entry3}' not found`;
			}

			Promise.all([
				cssnano.process(processedAsset1.source()),
				cssnano.process(processedAsset2.source()),
			]).then(([processedAssetMinified1, processedAssetMinified2]) => {
				const sampleSrc1 = fs.readFileSync(`./data/sample/${entry1}`, 'utf-8');
				const sampleSrc2 = fs.readFileSync(`./data/sample/${entry3}`, 'utf-8');

				const processedSrc1 = processedAssetMinified1.css;
				const processedSrc2 = processedAssetMinified2.css;

				expect(processedSrc1).to.equal(sampleSrc1);
				expect(processedSrc2).to.equal(sampleSrc2);

				done();
			})
		});
	});
	it('should generate valid rtl-css bundle ', (done) => {
		const asset = 'custom-media-for-rtl';

		const config = prepareConfig(preparePlugin({
			rtlPluginSupport: true
		}), {
			entryRTL: './data/moduleRTL/moduleRTL.js'
		});
		return webpack(config, (err, stats) => {
			if (err) {
				throw err;
			}
			const processedAsset = stats.compilation.assets[asset + '.css'];
			expect(processedAsset).to.not.be.undefined;
			const processedRTLAsset = stats.compilation.assets[asset + '.rtl.css'];
			expect(processedRTLAsset).to.not.be.undefined;

			Promise.all([
				cssnano.process(processedAsset.source()),
				cssnano.process(processedRTLAsset.source()),
			]).then(([processedAssetMinified, processedAssetRTLMinified]) => {
				const sampleSrc = fs.readFileSync(`./data/sample/${asset}.css`, 'utf-8');
				expect(processedAssetMinified.css).to.equal(sampleSrc);
				const sampleRTLSrc = fs.readFileSync(`./data/sample/${asset}.rtl.css`, 'utf-8');
				expect(processedAssetRTLMinified.css).to.equal(sampleRTLSrc);
				done();
			});
		});
	});
});


// TODO: cannot use arrow function in order to use this.timeout()
describe('Watch mode', function () {
	let chunksData = {};
	before(function () {
		chunksData = JSON.parse(fs.readFileSync('./data/sample/chunks.json'))[0];
	});

	beforeEach(function () {
		fs.copyFileSync('./data/entry1.js', './data/entry1_tmp.js');
	});

	it('should re-run only for changed chunks', function (done) {
		this.timeout(1000);
		const additionalContent = `import './module3/module3';`;
		runWPWatchMode({
				entry1: './data/entry1_tmp.js',
				entry2: './data/entry2.js',
			},
			additionalContent,
			function (modifiedChunks) {
				expect(modifiedChunks.length).to.eql(2);
				expect(modifiedChunks).to.eql(chunksData.initialChunks);
			}, function (modifiedChunks) {
				debugger;
				expect(modifiedChunks.length).to.eql(3);
				expect(modifiedChunks).to.eql(chunksData.updatedChunks);
				done();
			}
		);
	});

	afterEach(function () {
		fs.unlinkSync('./data/entry1_tmp.js');
	});
});
