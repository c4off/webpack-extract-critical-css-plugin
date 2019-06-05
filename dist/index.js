'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// const { forEachOfLimit } = require ('async');
var _require = require('webpack-sources'),
    ConcatSource = _require.ConcatSource;

var path = require('path');
var postcss = require('postcss');
var cssnano = require('cssnano');
var mediaParser = require('postcss-media-query-parser').default;

var defaultOptions = {
	customMedia: {
		'tv-category-critical': 'category-critical',
		'tv-some-dummy': 'some-dummy'
	},
	// customMedia: { 'tv-category-critical': 'category-critical' },
	minimize: {
		// TODO: ???
		browsers: ['> 1%', 'last 2 versions', 'Firefox >= 20'],
		preset: 'default'
	}
	// TODO: now it's just a stub. POC-version
};
var ExtractCriticalCSSPlugin = function () {
	function ExtractCriticalCSSPlugin() {
		var _this = this;

		var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

		_classCallCheck(this, ExtractCriticalCSSPlugin);

		this.pluginName = 'tv-webpack-extract-critical-css-plugin';
		// TODO: do it right
		// perform params check
		this._options = Object.assign({}, defaultOptions, options);

		this._mediaRuleNames = Object.keys(this._options.customMedia);
		this._criticalNodes = [];

		this._mediaRuleNames.forEach(function (mediaRuleName) {
			_this._criticalNodes[mediaRuleName] = [];
		});

		// generating at-rule filter
		this._atRuleFilter = new RegExp(Object.keys(this._options.customMedia).map(function (key) {
			return '(' + key + ')';
		}).join('|'));
		// this._updatedChunkFilenamesMap = {};
		// media nodes values from 'mediaParser'
		this._meaningfulMediaNodes = ['media-type', 'media-feature-expression'];
	}

	_createClass(ExtractCriticalCSSPlugin, [{
		key: 'apply',
		value: function apply(compiler) {
			var _this2 = this;

			compiler.hooks.emit.tapAsync(this.pluginName, function (compilation, callback) {
				_this2._colllectCriticalNodes(compilation);

				// resolve only after all sources are minified and added to compilation.assets
				Promise.all(_this2._getMinifyPromises(compilation)).then(function () {
					callback();
				});
			});
		}
	}, {
		key: '_isCustomOnlyMediaNode',
		value: function _isCustomOnlyMediaNode(node, customMediaTypes) {
			var _this3 = this;

			var mediaQueriesCount = 0;
			var currentCustomMediaTypes = {};

			node.each(function (mediaTypeObj) {
				if (_this3._meaningfulMediaNodes.indexOf(mediaTypeObj.type) === -1) {
					return;
				}
				mediaQueriesCount += 1;
				var mediaValue = mediaTypeObj.value;
				if (_this3._criticalNodes[mediaValue]) {
					customMediaTypes[mediaValue] = 1;
					currentCustomMediaTypes[mediaValue] = 1;
				}
			});

			return Object.keys(currentCustomMediaTypes).length === mediaQueriesCount;
		}

		/**
   * Removes custom media-type from media query string
   * @param mediaRule
   * @param chunksMap
   * @private
   */

	}, {
		key: '_truncateMediaQuery',
		value: function _truncateMediaQuery(mediaRuleNode) {
			var _this4 = this;

			function nodeValue(node) {
				return node.before + node.value + node.after;
			}

			var potentialBeforeKeyword = null;
			var nodeToRemove = null;

			var truncatedMediaRuleString = '';

			mediaRuleNode.each(function (node) {
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
						if (_this4._mediaRuleNames.indexOf(node.value) === -1) {
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
	}, {
		key: '_getFilteredMediaQuery',
		value: function _getFilteredMediaQuery(rule) {
			var _this5 = this;

			// check if we use several custom @media in one rule
			var chunksMap = {};
			var parsedMediaObj = mediaParser(rule.params);
			var mediaQueriesCount = 0;
			var updatedMediaRules = [];

			parsedMediaObj.each(function (mediaRuleNode) {
				// has side effect, chunksMap is filled with 'our' custom media-types
				if (!_this5._isCustomOnlyMediaNode(mediaRuleNode, chunksMap)) {
					updatedMediaRules.push(_this5._truncateMediaQuery(mediaRuleNode, chunksMap));
				}
			});

			return { chunksMap: chunksMap, updatedMediaRule: updatedMediaRules.join(',') };
			// debugger;
			// parsedMediaObj.nodes[0].each(mediaTypeObj => {
			// 	if (this._meaningfulMediaNodes.indexOf(mediaTypeObj.type) === -1) {
			// 		if (this._skippedNodes.indexOf(mediaTypeObj.type) === -1) {
			// 			updatedMediaRule += mediaTypeObj.before + mediaTypeObj.value + mediaTypeObj.after;
			// 		}
			// 		return;
			// 	}
			// 	mediaQueriesCount += 1;
			// 	debugger;
			// 	// find our 'custom' nodes and replace it with 'all'
			// 	const mediaValue = mediaTypeObj.value;
			// 	if (this._criticalNodes[mediaValue]) {
			// 		chunksMap[mediaValue] = mediaTypeObj.sourceIndex;
			// 		mediaTypeObj.value = 'all';
			// 	}
			// 	updatedMediaRule += mediaTypeObj.before + mediaTypeObj.value + mediaTypeObj.after;
			// });
			// debugger;
			// // if we have only `custom` media-queries
			// // so we can omit @media at all
			// if (Object.keys(chunksMap).length === mediaQueriesCount) {
			// 	updatedMediaRule = null;
			// }

			// return { chunksMap: chunksMap, updatedMediaRule: updatedMediaRule };
		}
	}, {
		key: '_processRule',
		value: function _processRule(rule) {
			var _this6 = this;

			debugger;
			var processedRules = [];

			var _getFilteredMediaQuer = this._getFilteredMediaQuery(rule),
			    chunksMap = _getFilteredMediaQuer.chunksMap,
			    updatedMediaRule = _getFilteredMediaQuer.updatedMediaRule;

			if (updatedMediaRule === '') {
				processedRules = rule.nodes;
			} else {
				// otherwise preserve non-custom @media
				var processedRule = postcss.parse('@media ' + updatedMediaRule).last;
				// TODO: maybe, appendChild
				processedRule.append(rule.nodes);
				processedRules = [processedRule];
			}
			// add critical rules to corresponding new chunks
			Object.keys(chunksMap).forEach(function (mediaRuleName) {
				_this6._criticalNodes[mediaRuleName] = _this6._criticalNodes[mediaRuleName].concat(processedRules);
			});

			return processedRules.map(function (processedRule) {
				return processedRule.clone();
			});

			// let chunksMap = {};

			// let mediaString = rule.params;
			//  this._mediaRuleNames.forEach(mediaRuleName => {
			//  	if (mediaString.indexOf(mediaRuleName) !== -1) {
			//  		chunksMap[mediaRuleName] = 1;
			// 	    // mediaString = mediaString.split(mediaRuleName).join('');
			// 	    mediaString = mediaString.replace(mediaRuleName, 'all');
			//     }
			//  });
			// let processedRules = [];
			// // if theres no @media other than custom,
			// // use only child rules
			// if (mediaString.trim() === '') {
			//     processedRules = rule.nodes;
			// } else {
			// 	// otherwise preserve non-custom @media
			// 	const processedRule = postcss.parse(`@media ${mediaString}`);
			// 	processedRule.append(rule.nodes);
			// 	processedRules = [processedRule];
			// }
			// // add critical rules to corresponding new chunks
			// Object.keys(chunksMap).forEach(mediaRuleName => {
			// 	this._criticalNodes[mediaRuleName] = this._criticalNodes[mediaRuleName].concat(processedRules);
			// });
			//
			// return processedRules.map(processedRule => processedRule.clone());
		}
	}, {
		key: '_colllectCriticalNodes',
		value: function _colllectCriticalNodes(compilation) {
			var _this7 = this;

			compilation.chunks.forEach(function (chunk, key, cb) {
				chunk.files.forEach(function (asset) {
					if (path.extname(asset) === '.css') {
						var baseSource = compilation.assets[asset].source();
						var source = postcss.parse(baseSource);
						var sourceModified = null;

						source.walkAtRules('media', function (rule) {
							if (_this7._atRuleFilter.test(rule.params)) {
								var processedRules = _this7._processRule(rule);
								// replace rule in original chunk
								rule.replaceWith(processedRules.map(function (processedRule) {
									return processedRule.clone();
								}));
								sourceModified = true;
							}
						});

						if (sourceModified) {
							source.walkAtRules('media', function (rule) {
								if (_this7._atRuleFilter.test(rule.params)) {
									debugger;
								}
							});
						}

						if (sourceModified) {
							compilation.assets[asset] = new ConcatSource(source.toString());
						}
					}
				});
			});
		}
	}, {
		key: '_getMinifyPromises',
		value: function _getMinifyPromises(compilation) {
			var _this8 = this;

			var cssMinifyPromises = [];
			this._mediaRuleNames.forEach(function (mediaRuleName) {
				if (!_this8._criticalNodes[mediaRuleName].length) {
					return;
				}
				var criticalNode = new postcss.root();
				_this8._criticalNodes[mediaRuleName].forEach(function (node) {
					return criticalNode.append(node);
				});
				// add newly generated css to assets
				var newFilename = path.basename(_this8._options.customMedia[mediaRuleName] + '.css');
				var cssMinifyPromise = cssnano.process(criticalNode.toString());
				cssMinifyPromises.push(cssMinifyPromise);
				cssMinifyPromise.then(function (result) {
					compilation.assets[newFilename] = new ConcatSource(result.css);
				});
			});

			return cssMinifyPromises;
		}
	}]);

	return ExtractCriticalCSSPlugin;
}();

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