import { forEachOfLimit } from 'async';

class ExtractCriticalCSSPlugin {
	pluginName = 'tv-webpack-extract-critical-css-plugin';

	constructor(options) {
		// TODO: do it right
		this.options = options || {
			bundles: []
		};
	}

	apply(compiler) {
		const criticalChunkName = 'feed-widget-idea';

		compiler.hooks.emit.tap(this.pluginName, (compilation) => {
			const criticalChunk = compilation.chunks.filter(chunk => chunk.name === criticalChunkName)[0];
			if (!criticalChunk) {
				throw new Error(`${this.pluginName} error. Cannot find chunk ${criticalChunk}`);
			}
			criticalChunk.files.forEach((asset) => {
				// TODO: Don't forget of [contenthash]
				if (path.extname(asset) === '.css') {
					const baseSource = compilation.assets[asset].source();
					// TODO: parse source
					const criticalSource = '.tv-critical { color: red}';
					const newAssetName = asset + '-critical';
					const newFilename = `${path.basename(newAssetName, '.css')}`;
					compilation.assets[newFilename] = new ConcatSource(criticalSource);
							// filename = asset.replace(path.basename(asset, '.css'), newFilename)
				}
			});
			debugger;
			// forEachOfLimit(compilation.chunks, 5, (chunk, key, cb) => {
			// 	// var rtlFiles = [],
			// 	// 	cssnanoPromise = Promise.resolve()
			//
			// 	chunk.files.forEach((asset) => {
			// 		if (path.extname(asset) === '.css') {
			// 			const baseSource = compilation.assets[asset].source()
			// 			let rtlSource = rtlcss.process(baseSource, this.options.options, this.options.plugins)
			// 			let filename
			//
			// 			if (this.options.filename) {
			// 				filename = this.options.filename
			//
			// 				if (/\[contenthash\]/.test(this.options.filename)) {
			// 					const hash = createHash('md5').update(rtlSource).digest('hex').substr(0, 10)
			// 					filename = filename.replace('[contenthash]', hash)
			// 				}
			// 			} else {
			// 				const newFilename = `${path.basename(asset, '.css')}.rtl`
			// 				filename = asset.replace(path.basename(asset, '.css'), newFilename)
			// 			}
			//
			// 			if (this.options.diffOnly) {
			// 				rtlSource = cssDiff(baseSource, rtlSource)
			// 			}
			//
			// 			if (this.options.minify !== false) {
			// 				let nanoOptions = {}
			// 				if (typeof this.options.minify === 'object') {
			// 					nanoOptions = this.options.minify
			// 				}
			//
			// 				cssnanoPromise = cssnanoPromise.then(() => {
			//
			// 					const rtlMinify = cssnano.process(rtlSource, nanoOptions).then(output => {
			// 						compilation.assets[filename] = new ConcatSource(output.css)
			// 						rtlFiles.push(filename)
			// 					});
			//
			// 					const originalMinify = cssnano.process(baseSource, nanoOptions).then(output => {
			// 						compilation.assets[asset] = new ConcatSource(output.css)
			// 					});
			//
			// 					return Promise.all([rtlMinify, originalMinify]);
			// 				})
			// 			} else {
			// 				compilation.assets[filename] = new ConcatSource(rtlSource)
			// 				rtlFiles.push(filename)
			// 			}
			// 		}
			// 	})
			//
			// 	cssnanoPromise.then(() => {
			// 		chunk.files.push.apply(chunk.files, rtlFiles)
			// 		cb()
			// 	})
			// })
		});
	}
}