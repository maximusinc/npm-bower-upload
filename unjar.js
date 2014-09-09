/**
 * Module extracts .jar archive into bower_components folder
 * @return {[type]} [description]
 */
module.exports = function () {
	var fs = require('fs');
	var fstream = require('fstream');
	var unzip = require('unzip');

	fs.readdir('bower_components', function (err, folders){
		folders.forEach(function (folder) {
			if (fs.lstatSync('bower_components/'+folder+'/index.jar').isFile()){
				var readStream = fs.createReadStream('bower_components/' + folder + '/index.jar');
				var writeStream = fstream.Writer('bower_components/' + folder);
				readStream
				  .pipe(unzip.Parse())
				  .pipe(writeStream);
				console.log("unjar bower_components/" + folder + "/index.jar Done!!");
			}
		});

	});
};