module.exports = function (bowerPath, callback) {
	bowerPath = bowerPath || './bower.json';
	var TMP_INITIAL = '.tmp/bower_install/bower_initial.json',
        CACHE_TMP = '.tmp/bower_install/',
		grunt = require('grunt'),
		bower = require('bower'),
		xmldoc = require('xmldoc'),
		unjar = require('./unjar.js'),
		Q = require('q'),
		fs = require('fs'),
		hasBwJSON = grunt.file.exists(bowerPath),
		bowerJson = hasBwJSON ? grunt.file.readJSON(bowerPath) : {},
		initialDeps = hasBwJSON ? grunt.file.readJSON(bowerPath) : {},
		deps = JSON.parse(JSON.stringify(bowerJson.dependencies)),
		newDeps = {},
		metadata = {},
		lastVersions = {};

		var cacheJson = function (key, data, raw) {
                if (!key) return;
                data = data || {};
                grunt.file.write(CACHE_TMP+key+'.json', raw ? data : JSON.stringify(data) );
            },
            cacheRead = function (key){
                return grunt.file.read(CACHE_TMP+key+'.json');
            },
            findLastBuild = function (filePath) {
				return Q.Promise(function (resolve, reject) {
					fs.readFile(filePath, function (err, data) {
						if (err) reject(err);
					  	var doc = new xmldoc.XmlDocument(data),
					  		arrVersions = doc.childNamed('versioning').childNamed('versions').childrenNamed('version'),
					  		child = arrVersions[ arrVersions.length - 1];
					  	resolve(child.val);
					});
				});
			},
			saveToBowerJsonDep = function (data, alias) {
				return  Q.Promise(function (resolve, reject) {
					if (grunt.file.exists(bowerPath)) {
                        if (alias === 'initial') {
                            grunt.file.write(bowerPath, cacheRead('initial'));
                        } else {
                            var json = grunt.file.readJSON(bowerPath),
                                str;
                            json.dependencies = data;
                            str = JSON.stringify(json);
                            grunt.log.debug(str);
                            grunt.file.write(bowerPath, str);
                        }
                        resolve();
					} else {
						setTimeout(function () {
							resolve();
                            grunt.fail.fatal('bower.json file is not exist');
						});
					}
				});
			},
			getMetadataXmlRoute = function (url) {
				var r = url.match(/g=([^&]+)/)[1],
					a = url.match(/a=([^&]+)/)[1];
				return 'http://nexus.rooxintra.net/content/repositories/releases/'+r.replace(/\./g,'/')+'/'+a+'/maven-metadata.xml';
			},
			findMetadataRequestDeps = function (deps) {
				var hasLastDep = function (url) {
						return (/~last~/).test(url);
					},
					depUrl;
				for (var alias in deps) {
					depUrl = deps[alias];
					if (hasLastDep(depUrl)) {
						metadata[alias] = getMetadataXmlRoute(depUrl);
					} else {
						newDeps[alias] = deps[alias];
					}
				}
                return metadata;
			},
			removeMetadaDir = function () {
				return Q.Promise(function (resolve, reject) {
					fs.rmdir('bower_components/maven-metadata',function (err) {
						if (err) reject(err);
						resolve();
					});
				});
			},
			makeBower2XmlRequest = function (params) {
				return Q.Promise(function (resolve, reject) {
					bower.commands
					.install([params.xmlUrl], {save: false})
					.on('end', function (installed) {
						resolve({
							params: params,
							installed: installed
						});
					})
					.on('error', function () {
						reject();
					});
				});
			},
			makeNewDependencyUrl = function (depUrl,lastVersion) {
				return depUrl.replace('~last~',lastVersion);
			},
			rmdirSyncForce = function(path) {
				var files, file, fileStats, i, filesLength;
				if (path[path.length - 1] !== '/') {
					path = path + '/';
				}

				files = fs.readdirSync(path);
				filesLength = files.length;

				if (filesLength) {
					for (i = 0; i < filesLength; i += 1) {
						file = files[i];

						fileStats = fs.statSync(path + file);
						if (fileStats.isFile()) {
							fs.unlinkSync(path + file);
						}
						if (fileStats.isDirectory()) {
							rmdirSyncForce(path + file);
						}
					}
				}
				fs.rmdirSync(path);
			},
			bowerInstall = function (force) {
				return Q.Promise(function (resolve, reject) {
					bower.commands
					.install([], {save: false, force: !!force})
					.on('end', function (installed) {
                        grunt.log.debug(installed);
						resolve();
					})
					.on('error', function () {
                        grunt.log.debug('eee');
						reject(new Error('Package no found!!'));
					});
				});
			},
			removeBowerPathSync = function () {
				var path = './bower_components';
                grunt.file.exists(path) && grunt.file.delete(path);
			},
			readVesrsions = function () {
				return Q.Promise(function (resolve, reject) {
					var all = [], aliases = [];
					for (var alias in metadata) {
						all.push(findLastBuild('bower_components/'+alias+'/index.xml'));
						aliases.push(alias);
					}
					Q.all(all).then(function (args) {
						var verAliases = {};
						args.forEach(function (version, index) {
							verAliases[aliases[index]] = version;
						});
						resolve(verAliases);
					});
				});
			},
			updateDependenciesVersions = function (verAliases) {
				for (var alias in verAliases) {
					newDeps[alias] = makeNewDependencyUrl(deps[alias],verAliases[alias]);
				}
			},
			exitWithError = function (reason) {
                grunt.log.debug('exit with error');
				if (reason) {
					grunt.log.errorlns(reason);
				}
                grunt.file.write(bowerPath, cacheRead('initial'));
				return Q.reject();
			};
    // RUN BLOCK
    cacheJson('initial', grunt.file.read(bowerPath), true);
	// remove bower_components path
	removeBowerPathSync();
	// find metadata xml url by depency urls
//	findMetadataRequestDeps(deps);
    cacheJson('metadata', findMetadataRequestDeps(deps));
//	console.info('Resolve versions from Metadata.xml:');
	for (var a in metadata) {
		grunt.log.writeln(a+' - '+metadata[a]);
	}
	saveToBowerJsonDep(metadata).then(function () {
		// upload all metadata xml files
        grunt.log.debug('try to upload metadata.xml using bower.install');
		return bowerInstall(true);
	}, exitWithError )
	.then(function () {
		// read last versions from .xml files
        grunt.log.debug('try to extract vesrions from metadata.xml');
		return readVesrsions();
	}, exitWithError)
	.then(function (verAliases) {
		// replace ~last~ to real version
		updateDependenciesVersions(verAliases);
		grunt.log.debug('Upload dependencies from:');
		for (var al in newDeps) {
			grunt.log.writeln(al+' - '+newDeps[al]);
		}
		// save
		return saveToBowerJsonDep(newDeps);
	}, exitWithError)
	.then(function () {
		removeBowerPathSync();
		return bowerInstall();
	}, exitWithError)
	.then(function () {
		return saveToBowerJsonDep(deps, 'initial');
	}, exitWithError)
	.then(function (){
		return unjar();
	}, exitWithError)
	.then(function () {
		grunt.log.oklns("All Done!!");
        callback();
	}, exitWithError);

};
