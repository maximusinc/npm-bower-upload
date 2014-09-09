(function () {

	var bower = require('bower'),
		xmldoc = require('xmldoc'),
		Q = require('q'),
		fs = require('fs'),
		bowerJson = require('./../../bower.json'),
		unjar = require('./unjar.js'),
		initialDeps = JSON.parse(JSON.stringify(bowerJson.dependencies)),
		deps = bowerJson && JSON.parse(JSON.stringify(bowerJson.dependencies)),
		newDeps = {},
		metadata = {},
		lastVersions = {};


		var findLastBuild = function (filePath) {
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
			saveToBowerJsonDep = function (data) {
				bowerJson.dependencies = data;
				return  Q.Promise(function (resolve, reject) {
					fs.writeFile('bower.json', JSON.stringify(bowerJson, null, 4), function(err) {
					    if(err) {
					      reject(err);
					    } else {
					      resolve();
					    }
					});
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
						resolve();
					})
					.on('error', function () {
						reject(new Error('Package no found!!'));
					});
				});
			},
			removeBowerPathSync = function () {
				var path = 'bower_components';
				if (fs.existsSync(path)) {
					rmdirSyncForce(path);
				}
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
				if (reason) {
					console.error(reason);
					saveToBowerJsonDep(initialDeps);
				}
				return Q.reject();
			};
	// remove bower_components path
	removeBowerPathSync();
	// find metadata xml url by depency urls
	findMetadataRequestDeps(deps);
	console.info('Resolve versions from Metadata.xml:');
	for (var a in metadata) {
		console.log(a+' - '+metadata[a]);
	}
	saveToBowerJsonDep(metadata).then(function () {
		// upload all metadata xml files
		return bowerInstall(true);
	}, exitWithError )
	.then(function () {
		// read last versions from .xml files
		return readVesrsions();
	}, exitWithError)
	.then(function (verAliases) {
		// replace ~last~ to real version
		updateDependenciesVersions(verAliases);
		console.info('Upload dependencies from:');
		for (var al in newDeps) {
			console.log(al+' - '+newDeps[al]);
		}
		// save
		return saveToBowerJsonDep(newDeps);
	}, exitWithError)
	.then(function () {
		removeBowerPathSync();
		return bowerInstall();
	}, exitWithError)
	.then(function () {
		return saveToBowerJsonDep(deps);
	}, exitWithError)
	.then(function (){
		return unjar();
	}, exitWithError)
	.then(function () {
		console.log("All Done!!");
	}, exitWithError);

})();