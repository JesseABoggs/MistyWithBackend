//This backend program will run on an administrator PC
//This code was written by Jesse Boggs, Hunter Parisey, Tim O'Brien, Judston Parling
//Companion code can be found on GitHub at https://github.com/JesseABoggs/MistyWithBackend

const { Connection, Request } = require("tedious");
const express = require('express')
const app = express()
var bodyParser = require('body-parser');
app.use(bodyParser.json());
var cors = require("cors");
app.use(cors());
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')("TWILIO INFO", "TWILIO INFO");

// Create connection to database
const config = {
  authentication: {
    options: {
      userName: "username", 
      password: "password" 
    },
    type: "default"
  },
  server: "yourdatabase.database.windows.net",
  options: {
    database: "database_name",
    encrypt: true
  }
};

//Function to grab all records with a certain fullname (primary key of database)
function queryRecord(id, res, connection) {
  console.log("Reading rows from the Table...");

  // Read the specified row from the database
  console.log(id)
  const request = new Request(
    "SELECT * FROM mistyclient WHERE fullname = '" + id + "'",
    (err, rowCount) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log(`${rowCount} row(s) returned`);
      }
    }
  );
    //populate the resonponse
  request.on("row", columns => {
    nvar = {}
    columns.forEach(column => {
      nvar[column.metadata.colName] = column.value
      //console.log("%s\t%s", column.metadata.colName, column.value);
    });
    console.log(nvar)
    res.send(nvar)
  });

  connection.execSql(request);
}


//Function to text the requested user
function textEm(req, res, connection){
  phone = req.body["phone"]
  temp = req.body["temp"]

  //when client is cleared for entry text them a clearance
  if (req.body['clearstate'] == 1) {
    client.messages
    .create({
      body: 'This is a confirmation text from the University of South Alabama, you are cleared for entry after following our COVID-19 scanning proccess. Your temperature was, ' + temp,
      from: '+19525294593',
      to: '+1'+ phone
    })
    .then(message => console.log(message.sid));
    console.log("Text sent to " + phone)
  }

  //If client did not pass the temperatre check text them with this information
  if (req.body['clearstate'] == 0) {
    client.messages
    .create({
      body: 'This is a confirmation text from the University of South Alabama, you are not cleared for entry after following our COVID-19 scanning proccess. Your temperature was, ' + temp,
      from: '+19525294593',
      to: '+1'+ phone
    })
    .then(message => console.log(message.sid));
    console.log("Text sent to " + phone)
  }
}


//Function to pass updates to the database
function passRecord(req, res, connection){
  fullname = req.body["fullname"]
  temp = req.body["lktemp"]
  temp = parseFloat(temp)
  console.log("this is the temp" + temp)
  temp = Math.round((temp + Number.EPSILON) * 100) / 100
  clears = req.body["clearstate"]
  console.log("Values being updated " + fullname, temp, clears)

  const request = new Request(
    "UPDATE mistyclient SET lktemp = " + temp + ", clearstate = '" + clears + "', lastdate = SYSDATETIME() WHERE fullname = '" + fullname + "'", (err) => {
      if (err){
        console.error(err.message)
      } else {
        console.log("post request successful")
      }

    })
    connection.execSql(request);
  }

//GET request at path/record where id is the paramter passed to get a row via queryRecord
app.get('/record/:id', function (req, res) {
    console.log(req.params.id)
    const connection = new Connection(config);
    connection.connect();
    connection.on("connect", err => {
      if (err) {
        console.error(err.message);
      } else {
        thiss = queryRecord(req.params.id, res, connection);
      }
    });

})

//POST request handler to text
app.post('/tochange/', function (req, res) {
  for (var key in req.body) {
    console.log(key, req.body[""+key])
  }
  const connection = new Connection(config);
  connection.connect();
  connection.on("connect", err => {
    if (err) {
      console.error(err.message);
    } else {
      thiss = textEm(req, res, connection);
    }
  });
})


//POST request that calls the record updating handler function
app.post('/clear', function (req, res) {
    for (var key in req.body) {
        console.log(key, req.body[""+key])
    }
    const connection = new Connection(config);
    connection.connect();
    connection.on("connect", err => {
      if (err) {
        console.error(err.message);
      } else {
        thiss = passRecord(req, res, connection);
      }
    });
})

app.listen(3000, '127.0.0.1');