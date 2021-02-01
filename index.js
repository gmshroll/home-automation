const express = require('express');
const app = express();
const path = require("path");

app.use(express.urlencoded()); //Parse URL-encoded bodies

app.get("/report/:type/:deviceId", (req, res) => {
	console.log("---- inbound at " + new Date() + " ----");
	console.log(req.query);
	console.log(req.params);
	res.send("OK");
});

app.all("/report", (req,res) => {
	console.log(req.query);
	res.send("OK");
});


app.get("/", (req, res) => {
	res.sendFile(__dirname + "/static/app.htm");
});

app.use("/", express.static('static'));

console.log(":3020");
app.listen(3020);