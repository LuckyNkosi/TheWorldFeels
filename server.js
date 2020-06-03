/*jshint esversion: 6 */
console.log('System is starting');
//System Imports
var fs = require('fs');
var express = require('express');
var socket = require('socket.io');
var app = express();
var server = app.listen(3000);

//Functional Imports
var Twit = require('twit');
var config = require('./config');
var where = require('node-where');
var Sentiment = require('sentiment');
var CountryCodes = require('./countrycodes');
var globeRef = require("./globeReference");
const sql = require('mssql');
 
var RestCountries = require('rest-countries-node');

var countryScores = new CountryCodes("NaN");
var countryFeelings = new CountryCodes("neutral");
const NEUTRAL = '#FF9900';
const DEFAULT = '#b3ffb3';
const NEGATIVE = '#990000';
const POSITIVE = '#00CC44';

const ROW_NEUTRAL = '#F78B42';
const ROW_DEFAULT = '#b3ffb3';
const ROW_NEGATIVE = '#990000';
const ROW_POSITIVE = '#00CC44';


//Server site
app.use(express.static('public'));
//Init web socket
var io = socket(server);
var socketReference;

//Communication Call backs
io.sockets.on('connection', (socket) => {
    console.log("new connection: " + socket.id);
    
    socket.on('GetData', Load);
    socket.on('RefData', GetReferenceData);
    socketReference = socket;
});


var sentiment = new Sentiment();
var restCountries = new RestCountries();
var NumberOfTweetsLoaded = 100;

var tweets;
var DataSet = []; //All the analyzed tweets
var countries;

//Load all the countries reference data once and begin process once done.
function Load(data) {
    console.log(data);
    countryScores = new CountryCodes("NaN");
    countryFeelings = new CountryCodes("neutral");
    DataSet = [];
    console.log("Loading Countries");
    if (!Exists(DataSet))
        restCountries.getAll()
        .then(response => {
            console.log("Countries loaded. Retrieving Tweets");
            countries = response;
            AnalyzeTweets(data);
        });
    else {
        AnalyzeTweets(data);
    }
}

//Keep stats of how many locations we can determine and how many we can't
var noLocation = 0;
var cantDetermineLocation = 0;

//Data Entry Definition
function DataEntry(location, score, comparative, tweetID, userID, lang, tweetText, region, subregion, alpha3Code, userHandle) {
    this.location = location;
    this.score = score;
    this.comparative = comparative;
    this.tweetID = tweetID;
    this.userID = userID;
    this.lang = lang;
    this.tweetText = tweetText;
    this.region = region;
    this.subregion = region;
    this.alpha3Code = alpha3Code;
    this.userHandle = userHandle;
    this.tweetURL = "https://twitter.com/"+userHandle+"/status/"+tweetID;
}

//Event Functions
function AnalyzeTweets(queryObj) {

    //Twitter API parameters
    var params = {
        q: queryObj.topic,
        count: NumberOfTweetsLoaded,
        lang: 'en'
    };

    //Get tweets, call GotData() When Done
    var T = new Twit(config);
    T.get('search/tweets', params, GotData);
}

//Call Backs
function GotData(err, data, response) {
    console.log("retreieved Tweets. Analyzing them");

    tweets = data.statuses;


    if (tweets != null && tweets.length > 0) {

        tweets.forEach(tweet => {
            var sentimentResult = ProcessTweet(tweet);
            DataSet.push(sentimentResult);          
        });
        console.log("\nNo Location: " + noLocation + ", Undeterminable: " + (cantDetermineLocation - noLocation) + " and Determined: " + (NumberOfTweetsLoaded - cantDetermineLocation) + " of " + NumberOfTweetsLoaded);
    } else {
        console.log("No tweets found on topic");
    }

    //Now that the data set has been derived, time to process it. 
    ProcessDataSet();
}

function ProcessTweet(tweet) {
    var location;
    if (Exists(tweet.location))
        location = tweet.location;
    else if (Exists(tweet.user.location))
        location = tweet.user.location;
    if (!Exists(location)) {
        noLocation++;
    }

    var result = sentiment.analyze(tweet.text);
    var countryInfo = {
        name: undefined,
        region: undefined,
        subregion: undefined,
        alpha3Code: undefined
    };
    if (Exists(location))
        countryInfo = GetCountry(location);

    return new DataEntry(countryInfo.name, result.score, result.comparative, tweet.id_str, tweet.user.id, 'en', tweet.text, countryInfo.region, countryInfo.subregion, countryInfo.alpha3Code, tweet.user.screen_name);
}


function ProcessDataSet() {

    console.log("Returning Data to FE");
    DataSet.forEach(element => {
        var code = element.alpha3Code;
        if (Exists(code) && code != "None") {
            //calculate each country's results
            if (countryScores[code] == "NaN")
                countryScores[code] = 0;
            countryScores[code] += element.comparative;
        } else {
            //Add those without countries to Rest of the world
            if (countryScores.ROW == "NaN"){
                countryScores.ROW = 0;
            }
            countryScores.ROW += element.comparative;
        }
    });

    for (let key in countryScores) {
        var score = countryScores[key];
        var nation = key.toUpperCase();
        if (score == "NaN")
            countryFeelings[nation] = DEFAULT;
        else if (score > 0)
            countryFeelings[nation] = POSITIVE;
        else if (score < 0)
            countryFeelings[nation] = NEGATIVE;
        else
            countryFeelings[nation] = NEUTRAL;
    }

    //Set Rest of the world/ocean colour
    var ROWScore = countryScores.ROW;
    if (ROWScore == "NaN")
        countryFeelings.ROW = ROW_DEFAULT;
    else if (ROWScore > 0)
        countryFeelings.ROW = ROW_POSITIVE;
    else if (ROWScore < 0)
        countryFeelings.ROW = ROW_NEGATIVE;
    else
        countryFeelings.ROW = ROW_NEUTRAL;

    var MATCHED = [];
    var UNMATCHED = [];
    var globeResults = [];
    globeRef.forEach(element => {
        // var a = element;

        var elem = countries.find((c) => {
            var a1 = c.name;
            var b1 = element.name;
            return (a1 == b1);
        });
        var clr = ROW_DEFAULT;
        if (elem != undefined) {
            MATCHED.push(element);
            clr = countryFeelings[elem.alpha3Code];
        }else{
            UNMATCHED.push(element);
        }

        var cntry = {
            "id": element.id,
            "name": element.name,
            "color": clr
        };
        globeResults.push(cntry);
    });

    var worldResponse = {
        map: countryFeelings,
        globe: globeResults,
        tweets: DataSet
    };
    socketReference.emit('dataReady', worldResponse);
}

function GetReferenceData(){
    restCountries.getAll()
        .then(response => {
            console.log("Countries loaded. Retrieving Tweets");
            countries = response;
            var RefResults = [];
            globeRef.forEach(element => {        
                var elem = countries.find((c) => {
                    var a1 = c.name;
                    var b1 = element.name;
                    return (a1 == b1);
                });
                var _code;
                if (elem != undefined) {
                    // MATCHED.push(element);
                    _code = elem.alpha3Code;
                }// }else{
                //     UNMATCHED.push(element);
                // }
        
                var cntry = {
                    "id": element.id,
                    "name": element.name,
                    "code": _code
                };
                RefResults.push(cntry);
            });
            socketReference.emit('refReady', RefResults);
        });
}

//Utility Functions
function GetCountry(locString) {

    //Check if the whole location string is a valid country
    // var country = "None"; //Default
    var temp = countries.find(FindCountry, locString);
    if (Exists(temp)) { //if valid, return it
        var obj = {
            name: temp.name,
            region: temp.region,
            subregion: temp.subregion,
            alpha3Code: temp.alpha3Code
        };
        return obj;
    }

    //If we didn't find a country, manipulate the string to check parts of it. 
    //in comma-seperated location notations, the country is usually last. To optimize,
    //we will begin at the end of the string. return as soon as we find a valid country
    var commaSepLocaion = locString.split(",");
    if (commaSepLocaion.length > 1)
        for (let index = commaSepLocaion.length - 1; index >= 0; index--) {
            temp = countries.find(FindCountry, commaSepLocaion[index]);
            if (Exists(temp)) { //if valid, assign name and return
                // var obj = {
                //     name: temp.name,
                //     region: temp.region,
                //     subregion: temp.subregion,
                //     alpha3Code: temp.alpha3Code
                // };
                return {
                    name: temp.name,
                    region: temp.region,
                    subregion: temp.subregion,
                    alpha3Code: temp.alpha3Code
                };
            }
        }

    //Seperate all words and check each
    var res = locString.split(" ");
    for (let index = res.length - 1; index >= 0; index--) {
        temp = countries.find(FindCountry, res[index]);
        if (Exists(temp)) { //if valid, assign name and return          
            return {
                name: temp.name,
                region: temp.region,
                subregion: temp.subregion,
                alpha3Code: temp.alpha3Code
            };
        }
    }

    cantDetermineLocation++;
    return "None";
}

function FindCountry(country) {
    var lookup = this.valueOf();
    // lookup = lookup.replace(/(?!\w|\s)./g, '');
    lookup = lookup.replace(/\s+/g, ' ');
    lookup = lookup.replace(/^(\s*)([\W\w]*)(\b\s*$)/g, '$2');

    if (country.alpha3Code == "USA")
        lookup = lookup;
    // var lookup = this.valueOf();
    // lookup
    return (
        country.name == lookup ||
        country.region == lookup ||
        country.capital == lookup ||
        country.subregion == lookup ||
        country.nativeName == lookup ||
        country.alpha2Code == lookup ||
        country.alpha3Code == lookup ||
        country.callingCodes[0] == lookup ||
        matchesTranslation(country.translations, country.altSpellings, lookup)
    );
}

function matchesTranslation(translations, altSpellings, lookup) {
    altSpellings.forEach(spelling => {
        if (spelling == lookup)
            return true;
    });

    return (
        translations.br == lookup ||
        translations.de == lookup ||
        translations.es == lookup ||
        translations.fa == lookup ||
        translations.fr == lookup ||
        translations.hr == lookup ||
        translations.it == lookup ||
        translations.ja == lookup ||
        translations.nl == lookup ||
        translations.pt == lookup
    );
}

function Exists(field) {
    return (field != null && field != undefined && field != "");
}


class globeCountry {
    constructor(id, name, color) {
        this.id = id;
        this.name = name;
        this.color = color;
    }
}