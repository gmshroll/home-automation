const express = require('express');
const app = express();
const path = require("path");
const fs = require('fs');
const child_process = require('child_process');
const fetch = require('node-fetch');
const yn = require('yn');

// socket.io
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.urlencoded()); 

const clients = {};


// http://192.168.1.198:3020/switch/relay/doorbell/0/true



const temperature = new Temperature();
function Temperature(){
	const self = this;

	const getAverageTemperatures = async () => {
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
	}

	// get latest temperature across all thermometers
	getAverageTemperatures();
	setInterval(getAverageTemperatures,1000 * 60);
}


// type: e.g. relay
// deviceId: e.g heating; landing
// switchIndex: switch ID, e.g. 0; 1, shelly2.5 has index for both switch inputs
// state: switch state: e.g. true, false
// example: /switch/relay/landing/0/on
app.get("/switch/:type/:deviceId/:switchIndex/:state", async(req, res) => {
	const { type, deviceId, switchIndex } = req.params;
	const state = yn(req.params.state);
	const jsonFile = (__dirname + '/iot/' + type + "-" + deviceId + ".json").toLowerCase();
	const allowedTypes = ["relay"];

	if (allowedTypes.indexOf(type) === -1){
		res.send("error");
		return;
	}

	// load/create iot db file
	let db = await openIotDatabaseFile(jsonFile);

	// ensure meta info is up to date
	db.type = type;
	db.deviceId = (deviceId + "").toLowerCase();
	db._updated = new Date().getTime(); 

	// truncate/rotate log
	if (!db.log){
		db.log = [];
	}
	if (db.log.length > 30){
		db.log.shift();
	}


	// carry out actions based on switch state change
	if (db.switchActions && typeof(db.switchActions[switchIndex]) !== "undefined"){
		// switchActions[0] is an array of actions to carry out
		// when receiving a switch state change. For example, we can 
		// immediately change the relay output of this device, or send
		// a message to the front-end to update the UI. 
		for (const i in db.switchActions[switchIndex]){
			// thisAction
			// {
			//		actionType: "relay",
			//		state: "switch"
			// }
			let thisAction = db.switchActions[switchIndex][i];


			// ------------------------------------------------------------------------------
			// CCTV dialog focus requested
			// we need to load information and parameters about this camera from its iot file
			if (thisAction.actionType === "cctvDialog"){
				const cctvJsonFile = (__dirname + "/iot/cctv-" + thisAction.camera + ".json").toLowerCase();
				cctvDb = await openIotDatabaseFile(cctvJsonFile);
				thisAction = {
					...thisAction,
					...cctvDb.streamDetails
				}
			}
			// ------------------------------------------------------------------------------

			// tell the UI about this switch
			for (const ii in clients){
				clients[ii].emit('relaySwitch', {
					type,
					deviceId,
					switchIndex,
					state,
					thisAction
				});
			}
		}
	}


	// save switch state
	if (!db.switchState){
		db.switchState = {};
	}
	db.switchState[switchIndex] = state;


	// write db file back
	await new Promise((r) => {
		fs.writeFile(jsonFile, JSON.stringify(db), 'utf8', (err) => {
			if (err){
				console.error("error writing db file for " + jsonFile, err);
				return r(false);
			}
			r(true);
		});
	});

	console.log("---- switch signal at " + new Date() + " ----");
	res.send("OK");
});

// allow devices to report status to us. Geared around temperature and humidity devices, but can be used for other inbound devices
app.get("/report/:type/:deviceId", async(req, res) => {
	// stuff arrives on req.query from the device, and self-identify with the type and deviceId params
	const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	const query = req.query;
	const { type, deviceId } = req.params;  
	const jsonFile = (__dirname + '/iot/' + type + "-" + deviceId + ".json").toLowerCase();
	const allowedTypes = ["ht"];

	if (allowedTypes.indexOf(type) === -1){
		res.send("error");
		return;
	}

	// load/create iot db file
	let db = await openIotDatabaseFile(jsonFile);

	// get information about this device by calling its /status endpoint
	const status = await new Promise((r) => {
		fetch("http://" + ip + "/status", {
			method: "GET"
		}).then(res => res.json()).then(json => r(json));
	});

	const batteryLevel = status.bat.value;

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
		data: query,
		batteryLevel
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
	res.send("OK");
});


async function openIotDatabaseFile(jsonFile){
	// see if there's an iot file we can load and append to
	return await new Promise((r) => {
		fs.access(jsonFile, fs.F_OK, (err) => {
			if (err) {
				console.error("error accessing db file", err);
				fs.writeFile(jsonFile, '{}', 'utf8', (errw) => {
					if (errw){
						console.error("error creating db file for " + jsonFile, errw);
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
}

app.get('/camera/poster/:username/:password/:ip', (req, res) => {
	const url = "http://" + req.params.ip + "/ISAPI/Streaming/channels/1/picture";
	fetch(url, {
		method:'GET',
		headers: {
          	Authorization: 'Basic ' + Buffer.from(req.params.username + ":" + req.params.password).toString('base64'),
        },
	}).then(resp => {
		resp.body.pipe(res);
    });
});

// camera feed to webm for <video> element 
app.get('/camera/feed/:username/:password/:ip', (req, res) => {
    res.header('content-type', 'video/webm');
    const cmd = ("ffmpeg -i rtsp://" + req.params.username + ":" + req.params.password + "@" + req.params.ip + "/Streaming/Channels/101 -c:v copy -c:a copy -bsf:v h264_mp4toannexb -maxrate 500k -f matroska -").split(' ');

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


let connectionID = 0;
io.on('connection', function(client) {
	console.log('Client connected...');
	connectionID++;

	clients[connectionID] = client;

	client.on('getTemperature', function(data, callback) {
    	// app requesting current temperature
    	callback({ temperature: temperature.average });
	});

	client.on("disconnect", (reason) => {
	    delete clients[connectionID];
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
	//console.log(req);
	res.send("404");
});

console.log(":3020");
server.listen(3020);