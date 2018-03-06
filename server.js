var keyspace = 'BDR';	//currently not being used
var server_port = 9001;
//changing "localhost" to "0.0.0.0" for AWS EC2 config
var server_ip = '0.0.0.0';

/*
 Required node module
 */
var express = require('express'); 
//var fs = require('fs');
//var https = require('https');
var mongodb = require('mongodb');
var client = mongodb.MongoClient;
var ObjectId = mongodb.ObjectId;
var Grid = require('gridfs-stream');
var busboyBodyParser = require('busboy-body-parser');
var bodyParser = require('body-parser');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var moment = require('moment');

//declare what is the primary key for the table specified
var primary_key = '_id';

/*
 Initialize a connection to the MongoDB
 change the IP and keyspace so that it is according to your setting.
 */
var db_server = 'localhost:27017';

//USE BELOW URL ONCE BDR ACCOUNT IS SETUP IN MONGODB
//var url = 'mongodb://' + keyspace + ':' + keyspace + '@' + db_server + '/' + keyspace + '?authMechanism=DEFAULT&authSource=' + keyspace + '&maxPoolSize=50';
var url = 'mongodb://' + db_server + '/bdr_db';

var db;

client.connect(url, function (err, database) {
    if (err) {
        console.log(err);
    } else {
        console.log('Connected successfully to database');
        db = database;
    }
});

//options for HTTPS enabling
/*var options = {
   key  : fs.readFileSync('server.key'),
   cert : fs.readFileSync('server.crt')
};*/

//using express for RESTful communcation
var app = express();
app.use(busboyBodyParser());
var urlencodedParser = bodyParser.urlencoded({ extended: true });   //for CRUD endpoints

//custom middleware to enable CORS
app.use(function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        next(); //VERY IMPORTANT
    });

app.use(bodyParser.json());
/*
Following are the CRUD endpoints for simple JSON data
*/
app.get('/ping', function (req, res) {
    res.send('Hello BDR Team! The NodeJS server is up.');
});

// CRUD: Create
app.post('/create', urlencodedParser, function (req, res) {
    if (typeof(req.body.collection) !== 'undefined' &&
        typeof(req.body.data) !== 'undefined') {
        var data = JSON.parse(req.body.data);
        if (Array.isArray(data)) {
            db.collection(req.body.collection).insertMany(data, {w:1}, function(err, result) {
                if (err) {
                    res.sendStatus(500);
                }
                else {
                    res.send(result);
                }
            });
        } else {
            db.collection(req.body.collection).insertOne(data, {w:1}, function(err, result) {
                if (err) {
                    res.sendStatus(500);
                }
                else {
                    res.send(result);
                }
            });
        }
    }
});

//CRUD: ReadOne
//TODO: make sure the data is returned in JSON format
app.post('/readOne', urlencodedParser, function (req, res) {
    if (typeof(req.body.collection) === 'undefined') {
        res.send({});
        return;
    }
    if (typeof(req.body._id) !== 'undefined') {
        var query = {};
        query[primary_key] = new ObjectId(req.body._id);
        db.collection(req.body.collection).find(query).next(function(err, result){
            if (err) {
                res.sendStatus(500);
            }
            else {
                res.send(result);
            }
        });
    } else if (typeof(req.body.data) !== 'undefined') {
        var data = JSON.parse(req.body.data);
        db.collection(req.body.collection).find(data).next(function(err, result){
            if (err) {
                res.sendStatus(500);
            }
            else {
                res.send(result);
            }
        });
    }
});

//CRUD: ReadAll
//TODO: make sure the data is returned in JSON format
app.post('/readAll', urlencodedParser, function (req, res) {
    if (typeof(req.body.collection) === 'undefined') {
        res.send([]);
        return;
    }
    var data;
    if (typeof(req.body.data) === 'undefined')
        data = {};
    else
        data = JSON.parse(req.body.data);
    db.collection(req.body.collection).find(data).toArray(function(err, result){
        if (err) {
            res.sendStatus(500);
        }
        else {
            res.send(result);
        }
    });
});

//CRUD: Delete
app.post('/delete', urlencodedParser, function (req, res) {
    if (typeof(req.body.collection) === 'undefined') {
        res.send();
        return;
    }
    if (typeof(req.body._id) !== 'undefined') {
        // Remove one document by _id
        var query = {};
        query[primary_key] = new ObjectId(req.body._id);
        db.collection(req.body.collection).removeOne(query, {w:1}, function(err, result) {
            if (err) {
                res.sendStatus(500);
            }
            else {
                res.send(result);
            }
        });
    }else if (typeof(req.body.data) !== 'undefined') {
        // Remove several documents with same key-value pair
        var data = JSON.parse(req.body.data);

        db.collection(req.body.collection).removeMany(data, {w:1}, function(err, result) {
            if (err) {
                res.sendStatus(500);
            }
            else {
                res.send(result);
            }
        });
    }
});

//CRUD: Update
app.post('/update', urlencodedParser, function (req, res) {
    if (typeof(req.body.collection) === 'undefined' ||
        typeof(req.body.newData) === 'undefined') {
        res.send();
        return;
    }
    var newData = JSON.parse(req.body.newData);
    if (typeof(req.body._id) !== 'undefined') {
        // update one document by _id
        var query = {};
        query[primary_key] = new ObjectId(req.body._id);
        db.collection(req.body.collection).updateOne(query, {$set:newData}, {w:1}).then(function(result) {
            res.send(result);
        });
    }else if (typeof(req.body.oldData) !== 'undefined') {
        // Remove several documents with same key-value pair
        var data = JSON.parse(req.body.oldData);
        db.collection(req.body.collection).updateMany(data, {$set:newData}, {upsert:true, w:1}).then(function(result) {
            res.send(result);
        });
    }
});

/*
Following are the endpoints for handling large file uploads
*/
//create an endpoint for file upload
app.post('/uploadVideo', function (req, res) {
    var metadata = JSON.parse(req.body.metadata);
    var videoClip = req.files.filefield;
    var reporterEmail;
    var reporterName;

    console.log(moment().format('MM-DD-YYYY HH:MM:SS'), ': received VIDEO');
    //check if Account exist for given phone number
    db.collection("account").findOne({
        'phone': metadata.phoneNumber
    }, function (err, account) {
        
        //if no account, then send "202" and exit
        if (err || account == null) {
            console.log(moment().format('MM-DD-YYYY HH:MM:SS'), ": account null. PHONE# received:  ", metadata.phoneNumber);
            res.status(202).send({
                message: "Incorrect account or account does not exist. Upload FAIL."
            });
        }
        
        //account exists, upload video and send emails
        else {
            reporterEmail = account.email;
            reporterName = account.fname + ' ' + account.lname;
            var fileId = new ObjectId();
//            console.log("VIDEO FILEID Created: ", fileId);
            
            try{
            
                var gfs = new Grid(db,mongodb);
            var writeStream = gfs.createWriteStream({
                _id: fileId ,  mode: 'w' , content_type: videoClip.mimetype ,
                metadata: {
                    "duration": metadata.duration
                    , "framesPerSecond": metadata.framesPerSecond
                    , "isImmediateHazard": metadata.isImmediateHazard
                    , "locationRecorded": metadata.locationRecorded
                    , "sizeInMB": metadata.sizeInMB
                    , "speedInMPH": metadata.speedInMPH
                    , "timeOfRecording": metadata.timeOfRecording
                    , "phoneNumber": metadata.phoneNumber
                }
            });
                
//            console.log("WriteStream created");
            writeStream.write(videoClip.data); //video file is now on the video collection
//            console.log("Write done");
            writeStream.on('close', function (file, err) {
                
                if(err){
                    console.log("Error in close: ", err);
                }
                var msg = "Upload Successful";
                var transporter = nodemailer.createTransport(smtpTransport({
                    service: 'Gmail'
                    , auth: {
                        user: 'baddriverreportin@gmail.com'
                        , pass: 'BadDriver@1101'
                    }
                }));
              
                //creating BDR report
                var report = {
                    "aggregateReviewScore": 0,
                    "capturedImage": null,
                    "category": null,
                    "date": moment().format('MM/DD/YYYY'),
                    "incidentDescription": null,
                    "licensePlateNumber": null,
                    "licenseState": null,
                    "location": metadata.locationRecorded,
                    "numApprovedReviews": 0,
                    "numRejectedReviews": 0,
                    "postingAccount": metadata.phoneNumber,
                    "reporterName": reporterName,
                    "severity": null,
                    "status":"uploaded",
                    "time": metadata.timeOfRecording,
                    "vehicleDescripton": null,
                    "videoClip": file._id
                }

                db.collection("baddriverreports").insertOne(report, function(err,r){

                    if(!err)
                        {
//                            console.log("BDR: ", r.insertedId);
                            //sending email to the user for successful file upload
                            var text = 'Hello,\n\n The Bad Driver Report is now available on: http://www.carma-cam.com/post-report.html?r_id=' + r.insertedId + ' \n\n';
                    	
			//additional link till web UI is up
			//    var videoLink = 'You can view the video here: http://ec2-35-164-242-197.us-west-2.compute.amazonaws.com:9001/downloadFile/' + file._id + '\n';
                            

                            //check if this was an Emergency ALert. Then create alert.
                            if (metadata.isImmediateHazard == 1) {
                                var alrt = {
                                        /* "date": moment().format('MM/DD/YYYY'),
                                        "driverDescription": null,
                                        "incidentDescription": null,
                                        "licensePlateNumber": null,
                                        "location": metadata.locationRecorded,
                                        "reporterName": reporterName,
                                        "time": metadata.timeOfRecording,
                                        "vehicleDescripton": null,
                                        "videoClip": file._id,
                                        "licenseState": null,
                                        "incidentType": null,
                                        "vehicleType": null,
                                        "reporterPhoneNumber": metadata.phoneNumber,
                                        "capturedImage": null*/

                                        "reportedAt" : new Date(),
                                        "location" : {"type":"Point", "coordinates": metadata.locationRecorded.split(",").map(function(i) {return parseFloat(i)})},
                                        "report": r.insertedId
                                    };

                                    db.collection("emergencyalerts").insert(alrt, function(err,r){

                                        if(!err) {
                                            //sending email to the user for successful file upload
                                            // var text = 'Hello, the Emergency Alert is now available on: http://baddriverreports.com/alerts.html?r_id=' + r.insertedId + ' \n Thank you.';
                                            // var mailOptions = {
                                            //     from: 'baddriverreportin@gmail.com'
                                            //     , to: reporterEmail
                                            //     , subject: 'Emergency Alert upload'
                                            //     , text: text
                                            // };
                                            // transporter.sendMail(mailOptions, function (error, info) {
                                            //     if (error) {
                                            //         console.log(moment().format('MM-DD-YYYY HH:MM:SS'), ": SENDMAIL failed. ", error);
                                            //         msg = msg + "\nError in sending email: " + error;
                                            //     }
                                            //     else {
                                            //         console.log(moment().format('MM-DD-YYYY HH:MM:SS'), ': Emergency Mail sent');
                                            //     }
                                            // });
                                            text += 'It\'s reported as an emergency alerts.\n\nThank you.\n\n';
                                        }
                                    });
                            }

                            var mailOptions = {
                                from: 'baddriverreportin@gmail.com'
                                , to: reporterEmail
                                , subject: 'Bad Driver Report uploaded'
                                , text: text
                            };
                            transporter.sendMail(mailOptions, function (error, info) {
                                if (error) {
                                    console.log(moment().format('MM-DD-YYYY HH:MM:SS'), ": SENDMAIL failed. ", error);
                                    msg = msg + "\nError in sending email: " + error;
                                }
                                else {
                                    console.log(moment().format('MM-DD-YYYY HH:MM:SS'), ': BDR Mail sent');
                                }
                            });
                        }
                });
                
                
                //Creation of BDR report and sending of emails done. Send success code to Mobile App
                res.status(200).send({
                    message: msg
                });
            });
            writeStream.end();
            }
            catch(err){
                console.error(err.stack);
            }
        }
            
    });
});

//API or endpoint to retrieve video file and captured license plate image, using their _id
app.get('/downloadFile/:id', function (req, res) {
    try {
        var gfs = new Grid(db,mongodb);
        gfs.findOne({
            '_id': req.params.id
        }, function (err, file) {
            console.log(moment().format('MM-DD-YYYY HH:MM:SS'),"ID received: ", req.params.id);
            if (file == null) {
                return res.status(400).send({
                    message: 'File not found'
                });
            }
            res.set('Content-Type', file.contentType);
            var readstream = gfs.createReadStream({
                _id: file._id
            });
            readstream.on("error", function (err) {
                console.log("Got error while processing stream " + err.message);
                res.end();
            });
            readstream.pipe(res);
        });
    }
    catch (err) {
        console.log(moment().format('MM-DD-YYYY HH:MM:SS'), 'EXCEPTION in /downloadFile: ', err);
        return res.status(400).send({
            message: "Exception encountered"
        });
    }
});

//endpoint for uploading captured image of license plate
app.post('/uploadImage', function (req, res) {
    
	var image = req.body.file;
    var model = JSON.parse(req.body.model);
    var reportId = new ObjectId(model.reportId);
    
    var gfs = new Grid(db,mongodb);
    var writeStream = gfs.createWriteStream({
        mode: 'w', content_type: "image/png"
    });

    writeStream.write(image); 
    console.log(moment().format('MM-DD-YYYY HH:MM:SS'),"Captured Image uploaded to Mongo");
    console.log(moment().format('MM-DD-YYYY HH:MM:SS'), "REPORT ID has been updated:", reportId);
    writeStream.on('close', function (file) {
        
        //update the BDR report with the capturedImage ID
        db.collection("baddriverreports").findOne({'_id': reportId}, function(err, doc){
            
                if(doc!=null){
                
                    var newData = {'capturedImage': file._id};
                    var conditions = {'_id': doc._id};
                    db.collection("baddriverreports").updateOne(conditions, {$set: newData},
                        function(err, result){
                            if(err){
                                res.status(400).send({
                                    message: "ERROR encountered while updating"
                                });
                            }
                            else{
                                res.status(200).send({
                                    message: "UPDATE successful"
                                });
                            }
                        });
                }
                else{
                    res.status(400).send({
                        message: "Report ID NOT FOUND"
                    });
                }
            });    
	});
    writeStream.end();
});


//This method of start is for HTTP server
var server = app.listen(server_port, server_ip, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("App listening at http://%s:%s", host, port)
});

//This method of start is for HTTPS server
/*var server = https.createServer(options, app).listen(server_port, server_ip, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("App listening at https://%s:%s", host, port)
});*/
