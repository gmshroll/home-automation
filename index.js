const express = require('express');
const app = express();
const path = require("path");
const bodyParser = require('body-parser');

app.use(bodyParser);

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/static/app.htm");
});

app.use("/", express.static('static'));

app.all("/report", function(req, res){
	console.log("---- inbound at " + new Date() + " ----");
	console.log(req.query);
	console.log(req.body);
	res.send("OK");
});

console.log(":3020");
app.listen(3020);