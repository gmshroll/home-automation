const express = require('express');
const app = express();
const path = require("path");

app.use(express.urlencoded()); //Parse URL-encoded bodies

app.get("/report", (req, res) => {
	console.log("---- inbound at " + new Date() + " ----");
	console.log(req.query);
	console.log(req.body);
	res.send("OK");
});

app.get('/hello', function(req, res){
  res.send('Hello World');
});


app.get("/", (req, res) => {
	res.sendFile(__dirname + "/static/app.htm");
});

app.use("/", express.static('static'));

console.log(":3020");
app.listen(3020);