const { ConcatSource } = require('webpack-sources');
const path = require('path');
const postcss = require('postcss');
const cssnano = require('cssnano');
const mediaParser = require('postcss-media-query-parser').default;

const defaultOptions = {
	minimize: {
		browsers: ['> 1%', 'last 2 versions', 'Firefox >= 20'],
		preset: 'default',
	},
	rtlPluginSupport: false,
	rtlOptions: {
		// should be surrounded by dots. E.g. `filename.rtl.css`
		fileNameTag: 'rtl'
	}
}

class ExtractCriticalCSSPlugin {
	constructor(options = {}) {
		this.pluginName = 'tv-webpack-extract-critical-css-plugin';
		// TODO: do it right
		// perform params check
		this._options = Object.assign({}, defaultOptions, options);
		this._rtlSupport = this._options.rtlPluginSupport;

		this._mediaRuleNames = Object.keys(this._options.customMedia);
		this._criticalNodes = [];

		this._mediaRuleNames.forEach(mediaRuleName => {
			this._criticalNodes[mediaRuleName] = [];
			if (this._rtlSupport) {
				const mediaRuleNameRTL = `${mediaRuleName}.${this._options.rtlOptions.fileNameTag}`
				this._criticalNodes[mediaRuleNameRTL] = [];
			}
		})

		// generating at-rule filter
		this._atRuleFilter = new RegExp(Object.keys(this._options.customMedia).map(key => `(${key})`).join('|'));
		// this._updatedChunkFilenamesMap = {};
		// media nodes values from 'mediaParser'
		this._meaningfulMediaNodes = [
			'media-type',
			'media-feature-expression',
		]
	}

	apply(compiler) {
		compiler.hooks.emit.tapAsync(this.pluginName, (compilation, callback) => {
			this._colllectCriticalNodes(compilation);

			// resolve only after all sources are minified and added to compilation.assets
			Promise.all(this._getMinifyPromises(compilation)).then(() => {
				callback();
			})
		});
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
	 * @param mediaRule
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
		let mediaQueriesCount = 0;
		let updatedMediaRules = [];

		parsedMediaObj.each(mediaRuleNode => {
			// has side effect, chunksMap is filled with 'our' custom media-types
			if (!this._isCustomOnlyMediaNode(mediaRuleNode, chunksMap)) {
				updatedMediaRules.push(this._truncateMediaQuery(mediaRuleNode, chunksMap));
			}
		});

		return { chunksMap: chunksMap, updatedMediaRule: updatedMediaRules.join(',') };
	}

	_processRule(rule, isRtlSource) {
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
			if (isRtlSource) {
				mediaRuleName += '.' + this._options.rtlOptions.fileNameTag
			}
			this._criticalNodes[mediaRuleName] = this._criticalNodes[mediaRuleName].concat(processedRules);
		});

		return processedRules.map(processedRule => processedRule.clone());
	}

	_colllectCriticalNodes(compilation) {
		compilation.chunks.forEach((chunk, key, cb) => {
			chunk.files.forEach((asset) => {
				if (path.extname(asset) === '.css') {
					let isRtlSource = false;
					if (this._rtlSupport && asset.indexOf(`.${this._options.rtlOptions.fileNameTag}.`) !== -1){
						isRtlSource = true;
					}

					const baseSource = compilation.assets[asset].source();
					let source = postcss.parse(baseSource);
					let sourceModified = null;

					source.walkAtRules('media', rule => {
						if (this._atRuleFilter.test(rule.params)) {
							const processedRules = this._processRule(rule, isRtlSource);
							// replace rule in original chunk
							rule.replaceWith(processedRules.map(processedRule => processedRule.clone()));
							sourceModified = true;
						}
					});

					if(sourceModified) {
						compilation.assets[asset] = new ConcatSource(source.toString());
					}
				}
			});
		});
	}

	_addMinifyPromise(mediaRuleName, compilation, cssMinifyPromises, rtl = false) {
		let fileName;
		if (rtl) {
			fileName = `${this._options.customMedia[mediaRuleName]}.${this._options.rtlOptions.fileNameTag}.css`;
			mediaRuleName = `${mediaRuleName}.${this._options.rtlOptions.fileNameTag}`
		} else {
			fileName = `${this._options.customMedia[mediaRuleName]}.css`;
		}
		if (!this._criticalNodes[mediaRuleName].length) {
			return;
		}
		const criticalNode = new postcss.root();
		this._criticalNodes[mediaRuleName].forEach(node => criticalNode.append(node));
		// add newly generated css to assets
		const newFileNameFull = path.basename(fileName);
		const cssMinifyPromise = cssnano.process(criticalNode.toString());
		cssMinifyPromises.push(cssMinifyPromise);
		cssMinifyPromise.then((result) => {
			compilation.assets[newFileNameFull] = new ConcatSource(result.css);
		});
	}

	_getMinifyPromises(compilation) {
		const cssMinifyPromises = [];
		this._mediaRuleNames.forEach(mediaRuleName => {
			this._addMinifyPromise(mediaRuleName, compilation, cssMinifyPromises);
			if (this._rtlSupport) {
				this._addMinifyPromise(mediaRuleName, compilation, cssMinifyPromises, true)
			}
		});

		return cssMinifyPromises;
	}
}

module.exports = ExtractCriticalCSSPlugin;
