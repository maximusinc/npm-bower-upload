/**
 * Module extracts .jar archive into bower_components folder
 * @return {[type]} [description]
 */
module.exports = function () {
	var fs = require('fs');
	var Q = require('q');
	var fstream = require('fstream');
	var unzip = require('unzip2');

	return Q.Promise(function (resolveMain, rejectMain) {
		fs.readdir('bower_components', function (err, folders){
            if (!folders) return;
			var promises = [];
			folders.forEach(function (folder) {
				promises.push(Q.Promise(function (resolve, reject){
					var hasJar;
					try {
						hasJar = fs.lstatSync('bower_components/'+folder+'/index.jar').isFile();
					} catch(e) {
						hasJar = false;
					}
					if (hasJar){
						var readStream = fs.createReadStream('bower_components/' + folder + '/index.jar');
						var writeStream = fstream.Writer('bower_components/' + folder);
						writeStream.on('close', function () {
							resolve();
							console.log("unjar bower_components/" + folder + "/index.jar Done!!");
						});
						writeStream.on('error', function () {
							reject();
							console.log("unjar bower_components/" + folder + "/index.jar Error!!");
						});
						readStream
						  .pipe(unzip.Parse())
						  .pipe(writeStream);
					}
				}));
			});
			Q.all(promises).then(resolveMain, rejectMain);
		});
	});
};
