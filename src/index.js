const { ConcatSource } = require('webpack-sources');
const path = require('path');
const postcss = require('postcss');
const cssnano = require('cssnano');
const rtlcss = require('rtlcss');
const mediaParser = require('postcss-media-query-parser').default;

const OPTIONS_VALIDATION_ERR_REQUIRED_MSG = `'customMedia' option is required and should be an object (str: str)`;
const OPTIONS_VALIDATION_ERR_ILLEGAL_MSG = `'customMedia' option must be an object (str: str)`;

const defaultOptions = {
	minimize: {
		browsers: ['> 1%', 'last 2 versions', 'Firefox >= 20'],
		preset: 'default',
	},
	rtlPluginSupport: false,
	rtlOptions: {
		// should be surrounded by dots. E.g. `filename.rtl.css`
		fileNameTag: 'rtl',
		rtlcssOptions: {},
	},
	debug: false,
};


/**
 * In `watch` mode there's a problem. Although, if only js is changed in source module,
 * critical css will be re-rendered. This is because webpack checks the chunk
 * and notice difference in css as well. As if we modify "internal" css assets (cut off `critical` parts),
 * but do not change source files.
 */
class ExtractCriticalCSSPlugin {
	constructor(options) {
		this._pluginName = 'webpack-extract-critical-css-plugin';
		this._modifiedChunks = []; // used only in `debug` mode

		const [res, msg] = this._validateOptions(options);
		if (res === false){
			throw new Error(this._pluginName + '. ' + msg)
		}

		this._options = Object.assign({}, defaultOptions, options);
		this._rtlSupport = this._options.rtlPluginSupport;

		this._debug = this._options.debug || false;

		this._mediaRuleNames = Object.keys(this._options.customMedia);
		this._criticalNodes = {};

		this._mediaRuleNames.forEach(mediaRuleName => {
			this._criticalNodes[mediaRuleName] = [];
		});

		// generating at-rule filter
		this._atRuleFilter = new RegExp(Object.keys(this._options.customMedia).map(key => `(${key})`).join('|'));
		// media nodes values from 'mediaParser'
		this._meaningfulMediaNodes = [
			'media-type',
			'media-feature-expression',
		];
		this._chunksCache = {};
	}

	apply(compiler) {
		compiler.hooks.afterCompile.tapAsync(this._pluginName, (compilation, callback) => {
			this._collectCriticalNodes(compilation);

			// resolve only after all sources are minified and added to compilation.assets
			Promise.all(this._getMinifyPromises(compilation)).then(() => {
				callback();
			})
		});
	}

	// used for debug purposes
	getModifiedChunks() {
		return this._modifiedChunks;
	}

	_validateOptions(options) {
		if (!options) {
			return [false, OPTIONS_VALIDATION_ERR_REQUIRED_MSG];
		}
		if (!(options.customMedia instanceof Object)) {
			return [false, OPTIONS_VALIDATION_ERR_REQUIRED_MSG];
		}
		if (options.customMedia instanceof Array) {
			return [false, OPTIONS_VALIDATION_ERR_REQUIRED_MSG];
		}
		let hasKeys = false;
		for (let customKey in options.customMedia) {
			hasKeys = true;
			if (typeof customKey !== 'string' ||
				typeof options.customMedia[customKey] !== 'string') {
				return [false, OPTIONS_VALIDATION_ERR_ILLEGAL_MSG];
			}
		}
		if (!hasKeys) {
			return [false, OPTIONS_VALIDATION_ERR_ILLEGAL_MSG];
		}

		return [true];
	}

	_isCustomOnlyMediaNode(node, customMediaTypes) {
		let mediaQueriesCount = 0;
		const currentCustomMediaTypes = {};

		node.each(mediaTypeObj => {
			if (this._meaningfulMediaNodes.indexOf(mediaTypeObj.type) === -1) {
				return;
			}
			mediaQueriesCount += 1;
			const mediaValue = mediaTypeObj.value;
			if (this._criticalNodes[mediaValue]) {
				customMediaTypes[mediaValue] = 1;
				currentCustomMediaTypes[mediaValue] = 1;
			}
		});

		return Object.keys(currentCustomMediaTypes).length === mediaQueriesCount;
	}

	/**
	 * Removes custom media-type from media query string
	 * @param mediaRuleNode
	 * @private
	 */
	_truncateMediaQuery(mediaRuleNode) {
		function nodeValue(node) {
			return node.before + node.value + node.after;
		}

		let potentialBeforeKeyword = null;
		let nodeToRemove = null;

		let truncatedMediaRuleString = '';

		mediaRuleNode.each(node => {
			switch (node.type) {
				case 'keyword':
					// if there's a custom rule found previously
					// skip it along with current 'and'
					// otherwise remember the node
					if (nodeToRemove === null) {
						potentialBeforeKeyword = node;
					} else {
						nodeToRemove = null;
					}
					break;
				case 'media-feature-expression':
					if (potentialBeforeKeyword) {
						truncatedMediaRuleString += nodeValue(potentialBeforeKeyword);
						potentialBeforeKeyword = null;
					}
					truncatedMediaRuleString += nodeValue(node);
					break;
				case 'media-type':
					// not custom rule
					if (this._mediaRuleNames.indexOf(node.value) === -1) {
						if (potentialBeforeKeyword) {
							truncatedMediaRuleString += nodeValue(potentialBeforeKeyword);
							potentialBeforeKeyword = null;
						}
						truncatedMediaRuleString += nodeValue(node);
						break;
					}
					// custom rule found

					// if there's a potential 'and' before custom node,
					// just skip them both, else remember to remove custom
					// rule and keyword after the rule
					if (potentialBeforeKeyword === null) {
						nodeToRemove = node;
					}
					break;
			}
		});

		return truncatedMediaRuleString;
	}

	_getFilteredMediaQuery(rule) {
		// check if we use several custom @media in one rule
		const chunksMap = {};
		let parsedMediaObj = mediaParser(rule.params);
		let updatedMediaRules = [];

		parsedMediaObj.each(mediaRuleNode => {
			// has side effect, chunksMap is filled with 'our' custom media-types
			if (!this._isCustomOnlyMediaNode(mediaRuleNode, chunksMap)) {
				updatedMediaRules.push(this._truncateMediaQuery(mediaRuleNode, chunksMap));
			}
		});

		return { chunksMap: chunksMap, updatedMediaRule: updatedMediaRules.join(',') };
	}

	_processRule(rule) {
		let processedRules = [];

		const { chunksMap, updatedMediaRule } = this._getFilteredMediaQuery(rule);

		if (updatedMediaRule === '') {
            processedRules = rule.nodes;
        } else {
			// otherwise preserve non-custom @media
			const processedRule = postcss.parse(`@media ${updatedMediaRule}`).last;
			// TODO: maybe, appendChild
			processedRule.append(rule.nodes);
			processedRules = [processedRule];
		}
		// add critical rules to corresponding new chunks
		Object.keys(chunksMap).forEach(mediaRuleName => {
			this._criticalNodes[mediaRuleName] = this._criticalNodes[mediaRuleName].concat(processedRules);
		});

		return processedRules.map(processedRule => processedRule.clone());
	}

	_collectCriticalNodes(compilation) {
		compilation.chunks.forEach((chunk, key, cb) => {
			const cachedChunk = this._chunksCache[chunk.id];
			if (cachedChunk && cachedChunk.hash === chunk.renderedHash) {
				return;
			}
			if (!cachedChunk) {
				this._chunksCache[chunk.id] = {}
			}
			this._chunksCache[chunk.id].hash = chunk.renderedHash;

			chunk.files.forEach((asset) => {
				if (path.extname(asset) === '.css') {
					const baseSource = compilation.assets[asset].source();

					let source = postcss.parse(baseSource);
					let sourceModified = null;

					source.walkAtRules('media', rule => {
						if (this._atRuleFilter.test(rule.params)) {
							const processedRules = this._processRule(rule);
							// replace rule in original chunk
							rule.replaceWith(processedRules.map(processedRule => processedRule.clone()));
							sourceModified = true;
						}
					});

					if(sourceModified) {
						if(this._debug) {
							this._modifiedChunks.push({
								chunk: chunk.name,
								contentHash: chunk.contentHash,
								renderedHash: chunk.renderedHash,
								asset: asset
							});
						}
						compilation.assets[asset] = new ConcatSource(source.toString());
					}
				}
			});
		});
	}

	_addMinifyPromises(mediaRuleName, compilation, cssMinifyPromises) {
		if (!this._criticalNodes[mediaRuleName].length) {
			return;
		}
		const criticalNode = new postcss.root();
		this._criticalNodes[mediaRuleName].forEach(node => criticalNode.append(node));

		const nodeSrc = criticalNode.toString();

		/** add newly generated css to assets */

		// generate rtl-chunk for critical css
		if (this._rtlSupport) {
			const rtlSrc = rtlcss.process(nodeSrc, this._options.rtlOptions.rtlcssOptions, {})
			const minifyRTLPromise = cssnano.process(rtlSrc, {from: undefined});
			cssMinifyPromises.push(minifyRTLPromise);

			const fileNameRTL = `${this._options.customMedia[mediaRuleName]}.${this._options.rtlOptions.fileNameTag}.css`;
			const fileNameRTLFull = path.basename(fileNameRTL);

			minifyRTLPromise.then((result) => {
				compilation.assets[fileNameRTLFull] = new ConcatSource(result.css);
			});
		}

		const cssMinifyPromise = cssnano.process(nodeSrc, {from: undefined});
		cssMinifyPromises.push(cssMinifyPromise);

		const fileName = `${this._options.customMedia[mediaRuleName]}.css`;
		const fileNameFull = path.basename(fileName);

		cssMinifyPromise.then((result) => {
			compilation.assets[fileNameFull] = new ConcatSource(result.css);
		});
	}

	_getMinifyPromises(compilation) {
		const cssMinifyPromises = [];
		this._mediaRuleNames.forEach(mediaRuleName => {
			this._addMinifyPromises(mediaRuleName, compilation, cssMinifyPromises);
		});
		return cssMinifyPromises;
	}
}

module.exports = ExtractCriticalCSSPlugin;
