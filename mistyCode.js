// Misty II Covid Screening
// Code modified and extended by Jesse Boggs, Hunter Parisey, Timothy O'Brien, and Judston Parlin
// For CIS 497 - Senior Project at the University of South Alabama
// Spring 2021
// This code and its companion code can be found on GitHub at https://github.com/JesseABoggs/MistyWithBackend
// By Hunter Giannini, Cody Hungerford,
// Michael Reynolds, and Shawn Ramos
// For CIS 497 - Senior Project at the University of South Alabama
// Fall 2020
// For use with the Misty Robotics Misty II, its Arduino Backpack, and the MLX 90614 IR Temp Sensor
// Previous team's code available at https://github.com/montypadre/misty-covid-screening

misty.Debug("Moving arms and head to neutral position");
misty.MoveHeadDegrees(0, 0, 0, 40); // Faces head forward
misty.MoveArmDegrees("both", 70, 100); // Lowers arms
misty.ChangeLED(0, 255, 0); // Changes LED to green
misty.DisplayImage("e_DefaultContent.jpg"); // Show default eyes
misty.Set("currentPerson", "", false) // Variable to store the current user
misty.Set("tempList", "[]", false) // List used during the temperature taking process to store temperature values to average
misty.Set("tempMode","no", false) // Timeout flag
misty.Set("DefaultTextLayer", false) //Text layer begins as invisible
misty.Set("user", JSON.stringify({fullname:"", email:"", phone:"", jagnumber:"", clearstate:"", lastdate:"", temp:""}), false) //set up global variable
misty.StartFaceRecognition();
registerFaceRec();

// ---------------------------------------- Functions For Face Recognition ---------------------------------------- //

//Registers Face Recognition Event
function registerFaceRec() {
    misty.AddPropertyTest("FaceRec", "Label", "exists", "", "string");
    misty.RegisterEvent("FaceRec", "FaceRecognition", 1000, true);
}

// Function called when a face recognition event occurs
function _FaceRec(data) {
    var faceDetected = data.PropertyTestResults[0].PropertyValue;
    if (faceDetected != "unknown person"){
        misty.SendExternalRequest("GET", "http://yourtunnelingurl.ngrok.io/record/" + faceDetected)
        misty.UnregisterEvent("FaceRec")
        misty.Set("currentPerson", faceDetected)
        misty.Set("tempList", "[]", false)
        misty.PlayAudio("s_SystemSuccess.wav", 50);
        misty.Pause(700);
        misty.Speak(`Hello ${faceDetected}, place your forehead in front of the sensor please.`, true);
        subscribeToTempData();
        misty.Set('tempMode', "yes", false)
        temperatureTimeout();
    }
    else{
        if (faceDetected != "unknown person") {
            //misty.Debug(`${faceDetected} has already been seen and emailed.`)
        }
        else {
            misty.UnregisterEvent("FaceRec")
            misty.Set("currentPerson", faceDetected)
            misty.Speak("Hello Guest, please come have your temperature taken before proceeding into the area", true)
            subscribeToTempData();
        }
    }
}


//Function needed here to receive data from the GET request to the Azure SQL db
function _SendExternalRequest(data) {
    misty.Debug("Inside of external request")
    user = JSON.parse(misty.Get("user"))
    obje = data.Result.ResponseObject.Data
    obje = JSON.parse(obje)
    user.fullname = obje.fullname
    user.email = obje.email
    user.phone = obje.phone
    user.jagnumber = obje.jagnumber
    user.clearstate = obje.clearstate
    user.lastdate = obje.lastdate
    user.temp = obje.lktemp
    misty.Set("user", JSON.stringify(user), false)
    misty.Debug(user)
}

//Returns Misty to waiting in face recognition mode if a person's temperature isn't taken after 10 seconds
function temperatureTimeout(){
    misty.Pause(11000)
    if (misty.Get("tempMode") == 'yes'){
        misty.Speak("Temperature measurement timed out")
        misty.UnregisterEvent('tempMessage')
        name = misty.Get("currentPerson")
        registerFaceRec()
    }
}


// ---------------------------------------- Functions for Taking Temperature ---------------------------------------- //
// Registers Serial Message event from the Arduino Backpack
function subscribeToTempData() {
    misty.AddReturnProperty("tempMessage", "SerialMessage");
    misty.RegisterEvent("tempMessage", "SerialMessage", 50, true);
}

// Called when Misty receives a message from the Arduino, which represents temperature measurements.
function _tempMessage(data) {
    try {
        if (data !== undefined && data !== null){
            combinedTemp = data.AdditionalResults[0].Message
            tempSplit = combinedTemp.split("|")
            ambTemp = parseFloat(tempSplit[0])
            objTemp = parseFloat(tempSplit[1])
            if (85 < objTemp && objTemp < 150){
                tempList = JSON.parse(misty.Get("tempList"))
                tempList.push(objTemp)
                misty.Set("tempList", JSON.stringify(tempList))
                if (tempList.length == 20){
                    misty.UnregisterEvent("tempMessage");
                    misty.Set("tempMode", "no", false)
                    determineTemp()
                }
            }
        }
    }
    catch (exception) {
        misty.Debug("Exception" + exception)
    }
}

// Check temp, then send text messages and update database
function determineTemp(){
    user = JSON.parse(misty.Get("user"))
    misty.Speak("Finished Taking Temperature")
    tempList = JSON.parse(misty.Get("tempList"))
    sum = tempList.reduce(function(a, b){
        return a + b;
    }, 0);
    average = sum/tempList.length.toFixed(2)
    truetemp = average + 8.0
    //misty.Debug(user)
    user.temp = truetemp
    misty.Debug("avg temp assigned")
    misty.Pause(400)
    if (average < 100.5 ){
        misty.Speak("Thank you, you should receive an approval text soon, you are cleared for entry")
        user.clearstate = "1"
        misty.Set("user", JSON.stringify(user))
        textEr(user)
        misty.DisplayImage("black.jpg")
        misty.DisplayText("Your temperature is " + truetemp, "DefaultTextLayer", 100, 500)
        misty.Pause(4000)
        misty.DisplayText("", "DefaultTextLayer");
        misty.DisplayImage("e_DefaultContent.jpg")
        postToDB(user)
    }
    else {
        misty.Speak("Your temperature is in an unsafe range. Please leave the area and consider getting tested.")
        user.clearstate = "0"
        misty.Set("user", JSON.stringify(user))
        textEr(user)
        postToDB(user)
        
    }
    if (misty.Get("currentPerson") != "unknown person"){
        //emailKnownUser(response)
        misty.Debug("unknown person temp check")
    }
    else (
        misty.Debug("else of temp")
    )
}

//Function to build a request to send to the program running on the administrator PC
function postToDB(user){
    user1 = JSON.parse(misty.Get("user"))
    misty.Debug(user1)
    jsonBody = {
        "clearstate": user1.clearstate, 
        "lktemp": user1.temp, 
        "fullname": user1.fullname
    }
    misty.SendExternalRequest("POST", 
    "http://yourtunnelingurl.ngrok.io/clear/", 
    null, 
    null,
    JSON.stringify(jsonBody),
    false,
    false,
    "application/json", 
    "")
}

//Function to build a request to send to the program running on the administrator PC
function textEr(user){
    user1 = JSON.parse(misty.Get("user"))
    misty.Debug(user1)
    jsonBody = {
        "temp": user1.temp, 
        "phone": user1.phone,
        "clearstate" : user1.clearstate
    }
    misty.SendExternalRequest("POST", 
    "http://yourtunnelingurl.ngrok.io/tochange/", 
    null, 
    null,
    JSON.stringify(jsonBody),
    false,
    false,
    "application/json", 
    "")
}