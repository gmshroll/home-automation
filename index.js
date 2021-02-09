const express = require('express');
const app = express();
const path = require("path");
const fs = require('fs');
const child_process = require('child_process');

// socket.io
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.urlencoded()); 


io.on('connection', function(client) {
	console.log('Client connected...');

	client.on('getTemperature', function(data, callback) {
    	// app requesting current temperature
    	callback({ temperature: temperature.average });
	});
});

const temperature = new Temperature();
function Temperature(){
	const self = this;

	// get latest temperature across all thermometers
	setInterval(async () => {
		let temps = await new Promise((resolve) => {
			let temps = [];
			fs.readdir(__dirname + '/iot/', async (err, files) => {
				for (const i in files){
					const file = __dirname + '/iot/' + files[i];
					let thisDevice = await new Promise((r, reject) => {
						fs.readFile(file, 'utf8', (err, data) => {
							let json;
							try {
								json = JSON.parse(data);
							} catch(e){
								return reject();
							}
							//console.log(JSON.stringify(json, null, 2));
							r(json);

						});
					}).catch(() => {
						console.error("couldn't read file " + file);
						return false;
					});

					if (thisDevice === false){
						continue;
					}

					if (thisDevice.type !== "ht"){
						continue;
					}
					if (thisDevice.excludeFromHouseAverage === true){
						continue;
					}

					let latestLog = thisDevice.log[thisDevice.log.length-1].data;
					temps.push({
						temperature: latestLog.temp,
						humidity: latestLog.hum
					});
				}

				resolve(temps);
			});
		});

		self.fullDetails = temps;

		let averageC = 0;
		for (const i in temps){
			averageC += temps[i].temperature; 
		}
		self.average = averageC / temps.length;
	},1000 * 60);
}


// allow devices to report status to us. Geared around temperature and humidity devices, but can be used for other inbound devices
app.get("/report/:type/:deviceId", async(req, res) => {
	// stuff arrives on req.query from the device, and self-identify with the type and deviceId params
	const query = req.query;
	const { type, deviceId } = req.params;  
	const jsonFile = (__dirname + '/iot/' + type + "-" + deviceId + ".json").toLowerCase();
	const allowedTypes = ["ht"];

	if (allowedTypes.indexOf(type) === -1){
		res.send("error");
		return;
	}

	// see if there's a file we can load and append to
	let db = await new Promise((r) => {
		fs.access(jsonFile, fs.F_OK, (err) => {
			if (err) {
				fs.writeFile(jsonFile, '{}', 'utf8', (err) => {
					if (err){
						console.error("error creating db file for " + jsonFile, err);
					}
					r({});
				});
			} else {
				fs.readFile(jsonFile, 'utf8', (err, data) => {
					r(JSON.parse(data));
				});
			}
		});
	});

	// ensure meta info is up to date
	db.type = type;
	db.deviceId = (deviceId + "").toLowerCase();
	db._updated = new Date().getTime(); 
	
	// append this log entry
	if (!db.log){
		db.log = [];
	}
	db.log.push({
		timestamp: new Date().getTime(),
		data: query
	});

	// truncate/rotate log
	if (db.log.length > 30){
		db.log.shift();
	}

	// write db file back
	await new Promise((r) => {
		fs.writeFile(jsonFile, JSON.stringify(db), 'utf8', (err) => {
			if (err){
				console.error("error creating db file for " + jsonFile, err);
				return r(false);
			}
			r(true);
		});
	});

	console.log("---- inbound at " + new Date() + " ----");
	console.log(req.query);
	console.log(req.params);
	res.send("OK");
});


// camera feed to webm for <video> element 
app.get('/camera/feed', (req, res) => {
    res.header('content-type', 'video/webm');
    const cmd = "ffmpeg -i rtsp://admin:C0mpaq01@192.168.1.94/Streaming/Channels/101 -c:v copy -c:a copy -bsf:v h264_mp4toannexb -maxrate 500k -f matroska -".split(' ');

    var child = child_process.spawn(cmd[0], cmd.splice(1), {
        stdio: ['ignore', 'pipe', process.stderr]
    });

    child.stdio[1].pipe(res);

    res.on('close', () => {
        // Kill ffmpeg if the flow is stopped by the browser
        child.kill();
        console.log("------ end of ffmpeg stream to app ------");
    });
});

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/static/app.htm");
});

app.use("/modules", express.static('node_modules'));
app.use("/", express.static('static'));

app.use(function(req, res, next){
	console.log("---- 404 at " + new Date() + " ----");
	console.log(req.query);
	console.log(req);
	res.send("404");
});

console.log(":3020");


server.listen(3020);