// const { forEachOfLimit } = require ('async');
const { ConcatSource } = require('webpack-sources');
const path = require('path');
const postcss = require('postcss');
const cssnano = require('cssnano');
const mediaParser = require('postcss-media-query-parser').default;

const defaultOptions = {
	customMedia: {
		'tv-category-critical': 'category-critical',
		'tv-some-dummy': 'some-dummy'
	},
	// customMedia: { 'tv-category-critical': 'category-critical' },
	minimize: {
		// TODO: ???
		browsers: ['> 1%', 'last 2 versions', 'Firefox >= 20'],
		preset: 'default',
	}
}
// TODO: now it's just a stub. POC-version
class ExtractCriticalCSSPlugin {
	constructor(options = {}) {
		this.pluginName = 'tv-webpack-extract-critical-css-plugin';
		// TODO: do it right
		// perform params check
		this._options = Object.assign({}, defaultOptions, options);

		this._mediaRuleNames = Object.keys(this._options.customMedia);
		this._criticalNodes = [];

		this._mediaRuleNames.forEach(mediaRuleName => {
			this._criticalNodes[mediaRuleName] = [];
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

	_isCustomOnlyMediaNode(node, chunksMap) {
		let mediaQueriesCount = 0;

		node.walk(mediaTypeObj => {
			if (this._meaningfulMediaNodes.indexOf(mediaTypeObj.type) === -1) {
				return;
			}
			mediaQueriesCount += 1;
			const mediaValue = mediaTypeObj.value;
			if (this._criticalNodes[mediaValue]) {
				chunksMap[mediaValue] = mediaTypeObj.sourceIndex;
			}
		});

		return chunksMap.length === mediaQueriesCount;
	}

	_truncateMediaQuery(mediaRule, chunksMap) {
		debugger;
		// return truncatedString
	}

	_getFilteredMediaQuery(rule) {
		// check if we use several custom @media in one rule
		const chunksMap = {};
		let parsedMediaObj = mediaParser(rule.params);
		let mediaQueriesCount = 0;
		let updatedMediaRule = '';

		// here base obj always holds a "container"
		// its children are real @media nodes
		// TODO nodes[0] - only the first node (e.g. @media screen, not print {})

		parsedMediaObj.nodes.forEach(mediaRule => {
			// has sideeffect, chunksMap is filled with 'our' custom media-types
			if (!this._isCustomOnlyMediaNode(mediaRule, chunksMap)) {
				updatedMediaRule += this._truncateMediaQuery(mediaRule, chunksMap);
			}
		});


		debugger;
		parsedMediaObj.nodes[0].walk(mediaTypeObj => {
			if (this._meaningfulMediaNodes.indexOf(mediaTypeObj.type) === -1) {
				if (this._skippedNodes.indexOf(mediaTypeObj.type) === -1) {
					updatedMediaRule += mediaTypeObj.before + mediaTypeObj.value + mediaTypeObj.after;
				}
				return;
			}
			mediaQueriesCount += 1;
			debugger;
			// find our 'custom' nodes and replace it with 'all'
			const mediaValue = mediaTypeObj.value;
			if (this._criticalNodes[mediaValue]) {
				chunksMap[mediaValue] = mediaTypeObj.sourceIndex;
				mediaTypeObj.value = 'all';
			}
			updatedMediaRule += mediaTypeObj.before + mediaTypeObj.value + mediaTypeObj.after;
		});
		debugger;
		// if we have only `custom` media-queries
		// so we can omit @media at all
		if (Object.keys(chunksMap).length === mediaQueriesCount) {
			updatedMediaRule = null;
		}

		return { chunksMap: chunksMap, updatedMediaRule: updatedMediaRule };
	}
	
	_processRule(rule) {
		// TODO:
		const { chunksMap, updatedMediaRule } = this._getFilteredMediaQuery(rule);
		// let chunksMap = {};

		let mediaString = rule.params;
		 this._mediaRuleNames.forEach(mediaRuleName => {
		 	if (mediaString.indexOf(mediaRuleName) !== -1) {
		 		chunksMap[mediaRuleName] = 1;
			    // mediaString = mediaString.split(mediaRuleName).join('');
			    mediaString = mediaString.replace(mediaRuleName, 'all');
		    }
		 });
		let processedRules = [];
		// if theres no @media other than custom,
		// use only child rules
		if (mediaString.trim() === '') {
            processedRules = rule.nodes;
        } else {
			// otherwise preserve non-custom @media
			const processedRule = postcss.parse(`@media ${mediaString}`);
			processedRule.append(rule.nodes);
			processedRules = [processedRule];
		}
		// add critical rules to corresponding new chunks
		Object.keys(chunksMap).forEach(mediaRuleName => {
			this._criticalNodes[mediaRuleName] = this._criticalNodes[mediaRuleName].concat(processedRules);
		});

		return processedRules.map(processedRule => processedRule.clone());
	}

	_colllectCriticalNodes(compilation) {
		compilation.chunks.forEach((chunk, key, cb) => {
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
						source.walkAtRules('media', rule => {
							if (this._atRuleFilter.test(rule.params)) {
								debugger;
							}
						});
					}

					if(sourceModified) {
						compilation.assets[asset] = new ConcatSource(source.toString());
					}
				}
			});
		});
	}

	_getMinifyPromises(compilation) {
		const cssMinifyPromises = [];
		this._mediaRuleNames.forEach(mediaRuleName => {
			if (!this._criticalNodes[mediaRuleName].length) {
				return;
			}
			const criticalNode = new postcss.root();
			this._criticalNodes[mediaRuleName].forEach(node => criticalNode.append(node));
			// add newly generated css to assets
			const newFilename = path.basename(`${this._options.customMedia[mediaRuleName]}.css`);
			const cssMinifyPromise = cssnano.process(criticalNode.toString());
			cssMinifyPromises.push(cssMinifyPromise);
			cssMinifyPromise.then((result) => {
				compilation.assets[newFilename] = new ConcatSource(result.css);
			});
		});

		return cssMinifyPromises;
	}
}

						// let filename
						//
						// if (this.options.filename) {
						// 	filename = this.options.filename
						//
						// 	if (/\[contenthash\]/.test(this.options.filename)) {
						// 		const hash = createHash('md5').update(rtlSource).digest('hex').substr(0, 10)
						// 		filename = filename.replace('[contenthash]', hash)
						// 	}
						// } else {
						// 	const newFilename = `${path.basename(asset, '.css')}.rtl`
						// 	filename = asset.replace(path.basename(asset, '.css'), newFilename)
						// }
						//
						// if (this.options.diffOnly) {
						// 	rtlSource = cssDiff(baseSource, rtlSource)
						// }
						//
						// if (this.options.minify !== false) {
						// 	let nanoOptions = {}
						// 	if (typeof this.options.minify === 'object') {
						// 		nanoOptions = this.options.minify
						// 	}
						//
						// 	cssnanoPromise = cssnanoPromise.then(() => {
						//
						// 		const rtlMinify = cssnano.process(rtlSource, nanoOptions).then(output => {
						// 			compilation.assets[filename] = new ConcatSource(output.css)
						// 			rtlFiles.push(filename)
						// 		});
						//
						// 		const originalMinify = cssnano.process(baseSource, nanoOptions).then(output => {
						// 			compilation.assets[asset] = new ConcatSource(output.css)
						// 		});
						//
						// 		return Promise.all([rtlMinify, originalMinify]);
						// 	})
						// } else {
						// 	compilation.assets[filename] = new ConcatSource(rtlSource)
						// 	rtlFiles.push(filename)
						// }
				// 	}
				// })

				// cssnanoPromise.then(() => {
				// 	chunk.files.push.apply(chunk.files, rtlFiles)
				// 	cb()
				// })


module.exports = ExtractCriticalCSSPlugin;