/*jshint esversion: 6 */
var socket;
var map;
var TWITTER_TOPIC;
const NEUTRAL = '#FF9900';
const NEGATIVE = '#990000';
const POSITIVE = '#00CC44';

var searchButton;

//Globe 
// ms to wait after dragging before auto-rotating
var rotationDelay = 3000;
// scale of the globe (not the canvas element)
var scaleFactor = 0.9;
// autorotation speed
var degPerSec = 6;
// start angles
var angles = {
	x: -20,
	y: 40,
	z: 0
};
// colors
var colorWater = '#fff';
var colorLand = '#111';
var colorGraticule = '#ccc';
var colorCountry = '#a00';

var ALLTWEETS;


var current;
var canvas;
var a; // = canvas.node();
var context; // = a.getContext('2d');
var water = {
	type: 'Sphere'
};
var projection; 
var graticule; 
var path; 
var v0; // Mouse position in Cartesian coordinates at start of drag gesture.
var r0; // Projection rotation as Euler angles at start.
var q0; // Projection rotation as versor at start.
var lastTime = d3version4.now();
var degPerMs = degPerSec / 1000;
var width, height;
var land, countries;
var countryList;
var autorotate, now, diff, roation;
var currentCountry;
var globeColors = [];
var projectMap = -1;

var infoScreenState = {
	state: 0,
	noOfStates: 7
};

var BtnNoFilter;
var BtnNegative;
var BtnNeutral;
var BtnPositive;
// var tweetsFilter = 
var FilterStates = Object.freeze({
	"NoFilter": 1,
	"Negative": 2,
	"Neutral": 3,
	"Positive": 4
});
var tweetFilter = FilterStates.NoFilter;

var currentGlobeCountry;
var CountryReferenceData;

function setup() {


	current = d3version4.select('#current');
	canvas = d3version4.select('#globe');
	a = canvas.node();
	context = a.getContext('2d');

	projection = d3version4.geoOrthographic().precision(0.1);
	graticule = d3version4.geoGraticule10();
	path = d3version4.geoPath(projection).context(context);

	// Configuration
	//connect to where the server is listening
	socket = io.connect('http://localhost:3000');
	//Call dataReceived when the server call returnsvsd
	socket.on('dataReady', ProcessDataReceived);
	socket.on('refReady', (data) => {
		CountryReferenceData = data;
	});
	socket.emit('RefData', 'reference');

	canvas
		.call(d3version4.drag()
			.on('start', dragstarted)
			.on('drag', dragged)
			.on('end', dragended)
		)
		.on('mousemove', mousemove);

	var inp = createInput('');
	inp.class('form-control');
	var modalInpID = select('#twitterInput');
	inp.parent(modalInpID);

	// searchButton = createButton('Search');
	searchButton = select('#searchBtn');
	// searchButton.position(19, 19);
	searchButton.mousePressed(Search);
	inp.input(myInputEvent);

	var infoNextButton = select('#infoNextBtn');
	infoNextButton.mousePressed(() => {
		select('#About' + infoScreenState.state).class('hidden');
		if (infoScreenState.state < (infoScreenState.noOfStates - 1)) {
			infoScreenState.state++;
			
		} else {
			infoScreenState.state = 0;
		}
		select('#About' + infoScreenState.state).removeClass('hidden');

		if (infoScreenState.state > 0) {
			select('#About' + infoScreenState.state).removeClass('disabled');
		} else
			select('#About' + infoScreenState.state).class('disabled');
	});
	// //connect to where the server is listening
	// socket = io.connect('http://localhost:3000');
	// //Call dataReceived when the server call returnsvsd
	// socket.on('dataReady', dataReceived);
	//Ask the server for data

	map = new Datamap({
		element: document.getElementById('mapContainer'),

		done: function (datamap) {
			datamap.svg.selectAll('.datamaps-subunit').on('click', function (geography) {
				Map_ClickedOn(geography.id);
			});
		}
	});


	group = createDiv('');
	group.position(50, 50);
	label1 = createSpan('Map View    ');
	label1.parent(group);
	slider = createSlider(0, 1, 0, 1);
	slider.parent(group);
	label = createSpan('  Globe View');
	label.parent(group);

	///Filter Buttons
	//Create 
	BtnNeutral = createButton('Neutral').class('btn btn-sm btn-default');
	BtnNegative = createButton('Negative').class('btn btn-sm btn-default');
	BtnPositive = createButton('Positive').class('btn btn-sm btn-default');
	BtnNoFilter = createButton('No Filter').class('btn btn-sm btn-default');

	//Attach to div
	BtnNoFilter.parent(select('#feedFilterButtons'));
	BtnNegative.parent(select('#feedFilterButtons'));
	BtnNeutral.parent(select('#feedFilterButtons'));
	BtnPositive.parent(select('#feedFilterButtons'));
	//Action buttons
	BtnNoFilter.mousePressed(() => {
		setTweetsFilter(FilterStates.NoFilter);
		BtnNoFilter.class('btn-primary');
	});
	BtnNegative.mousePressed(() => {
		setTweetsFilter(FilterStates.Negative);
		BtnNegative.class('btn-danger');
		// select('#twitterFeed').class('negativeFilter');
	});
	BtnNeutral.mousePressed(() => {
		setTweetsFilter(FilterStates.Neutral);
		BtnNeutral.class('btn-warning');
		// select('#twitterFeed').class('neutralFilter');
	});
	BtnPositive.mousePressed(() => {
		setTweetsFilter(FilterStates.Positive);
		BtnPositive.class('btn-success');
		// select('#twitterFeed').class('positiveFilter');
	});


	//This reduncy is to activate all the buttons, otherwise they load with a weird size until they are clicked on at least once
	BtnPositive.class('btn-success');
	BtnNeutral.class('btn-warning');
	BtnNegative.class('btn-danger');
	CleraAllFilterButtons();

	//Default Button Clicked
	BtnNoFilter.class('btn-primary');

	CreateKeyLegend();

}

function CreateKeyLegend() {
	// var keyNeutral = createElement('p', 'Neutral').parent(createDiv('').class('keyCode row ').parent(select('#keyLegend')));
}

$("#twitterFeed li").click(function (e) {
	var zx = $(this); //.remove();
});


function Map_ClickedOn(countryID) {
	CleraAllFilterButtons();
	select('#filterCountryLabel').removeClass('hidden');
	var location = UpdateTweetsByCountryCode(countryID);
	select('#filterCountry').elt.innerText = Exists(location) ? location : GetCountryFromCode(countryID).name + " (No Tweets available)";
}

function GetCountryFromCode(alpha3code) {
	var az =  CountryReferenceData.find(function (c) {
		return c.code === alpha3code;
	});
	return az;
	// var ac = count;
}

function GetCountryFromID(idVal) {
	return CountryReferenceData.find(function (c) {
		var idN = parseInt(c.id, 10);
		var qNo = parseInt(idVal, 10);
		return idN === qNo;
	});
}

function setTweetsFilter(filterState) {
	//Clear All buttons of 'active state
	CleraAllFilterButtons();

	//set relevant state
	tweetFilter = filterState;
	UpdateTweetDisplayByFeeling(filterState);
}

function CleraAllFilterButtons() {
	//remove Country filter & Clear All buttons of 'active state
	select('#filterCountryLabel').class('hidden');
	BtnNoFilter.removeClass('btn-primary');
	BtnNegative.removeClass('btn-danger');
	BtnNeutral.removeClass('btn-warning');
	BtnPositive.removeClass('btn-success');
}


$(document).on('click', function () {
	if (currentGlobeCountry != undefined) { //we have a country
		var highlightedCountry = GetCountryFromID(currentGlobeCountry.id);
		Map_ClickedOn(highlightedCountry.code);
		console.log(2);
	}
});


function UpdateTweetsByCountryCode(code) {

	if (ALLTWEETS != undefined) {

		var filteredTweeets = ALLTWEETS.filter((item) => {
			return item.alpha3Code == code;
		});

		UpdateTwitterFeed(filteredTweeets);

		if (filteredTweeets.length > 0)
			return filteredTweeets[0].location;
	}
}

function UpdateTweetDisplayByFeeling(feeling) {

	if (feeling == FilterStates.NoFilter)
		UpdateTwitterFeed(ALLTWEETS);
	else {
		if (ALLTWEETS != undefined) {

			var filteredTweeets = ALLTWEETS.filter(function (item) {
				if (feeling == FilterStates.Negative)
					return item.comparative < 0;
				if (feeling == FilterStates.Neutral)
					return item.comparative == 0;
				if (feeling == FilterStates.Positive)
					return item.comparative > 0;
			});
			UpdateTwitterFeed(filteredTweeets);
		}
	}
}

function draw() {
	
	var projectionSlider = slider.value();
	if (projectionSlider != projectMap) {
		projectMap = projectionSlider;
		if (projectMap == 0) {
			select('#mapContainer').removeClass('hidden');
			select('#globe').class('hidden');
		} else {
			select('#globe').removeClass('hidden');
			select('#mapContainer').class('hidden');
		}
	}
	// if (currentGlobeCountry != undefined) {
	// 	fill(255);
	// 	text("shi", mouseX, mouseY);
	// 	// text(str, x, y, x2, y2)
	// 	$("#globe-tooltip").css({top: mouseX, left: mouseY });
	// 	$('[data-toggle="tooltip"]').tooltip('show');
	// } else {
	// 	$('[data-toggle="tooltip"]').tooltip('hide');
	// }

}

function myInputEvent() {
	console.log('you are typing: ', this.value());
	TWITTER_TOPIC = this.value();
}

function Search() {
	var val = random(255);
	console.log("searching");

	var query = {
		topic: TWITTER_TOPIC
	};
	socket.emit('GetData', query);

	//loader on screen
	$('#cover-spin').show(0);
}

function UpdateMap(data) {
	console.log(data);

	//update ocean colour
	var oceans = select('#mapContainer');
	// oceans.style('background-color', data.ROW);

	//update all countries
	map.updateChoropleth(data, {
		reset: true
	});
}

function dataReceived(data) {
	console.log('data received');

	console.log(data);
	var results;
	UpdateMap(data);
	// noStroke();
	// fill(147);
	// ellipse(data.x, data.y, 36,36);
}

function Nazo(data) {
	console.log("nazo called");

}


function dragstarted() {
	v0 = versor.cartesian(projection.invert(d3version4.mouse(this)));
	r0 = projection.rotate();
	q0 = versor(r0);
	stopRotation();
}

function dragged() {
	var v1 = versor.cartesian(projection.rotate(r0).invert(d3version4.mouse(this)));
	var q1 = versor.multiply(q0, versor.delta(v0, v1));
	var r1 = versor.rotation(q1);
	projection.rotate(r1);
	render();
}

function dragended() {
	startRotation(rotationDelay);
}

function mousemove() {
	var c = getCountry(this);
	if (!c) {
		if (currentCountry) {
			leave(currentCountry);
			currentCountry = undefined;
			render();
		}
		return;
	}
	if (c === currentCountry) {
		return;
	}
	currentCountry = c;
	render();
	enter(c);
}


function getCountry(event) {
	var pos = projection.invert(d3version4.mouse(event));
	return countries.features.find(function (f) {
		return f.geometry.coordinates.find(function (c1) {
			return polygonContains(c1, pos) || c1.find(function (c2) {
				return polygonContains(c2, pos);
			});
		});
	});
}

// https://github.com/d3/d3-polygon
function polygonContains(polygon, point) {
	var n = polygon.length;
	var p = polygon[n - 1];
	var x = point[0],
		y = point[1];
	var x0 = p[0],
		y0 = p[1];
	var x1, y1;
	var inside = false;
	for (var i = 0; i < n; ++i) {
		p = polygon[i];
		x1 = p[0];
		y1 = p[1];
		if (((y1 > y) !== (y0 > y)) && (x < (x0 - x1) * (y - y1) / (y0 - y1) + x1)) inside = !inside;
		x0 = x1;
		y0 = y1;
	}
	return inside;
}

function render() {
	if (canvas != undefined) {
		context.clearRect(0, 0, width, height);
		globefill(water, '#2daf5c');
		globestroke(graticule, colorGraticule);
		globefill(land, colorLand);
		// var c = countries.features[21];
		// var cl = countryList;
		if (globeColors != undefined)
			globeColors.forEach(element => {

				var cnt = countries.features.find(function (c) {
					var idN = parseInt(c.id, 10);
					var qNo = parseInt(element.id, 10);
					return idN === qNo;
				});

				if (cnt != undefined && cnt != null)
					globefill(cnt, element.color);
			});
		// countries.features.forEach(c => {
		// 	globefill(c, colorCountry);
		// });
	}
}

function globefill(obj, color) {
	context.beginPath();
	path(obj);
	context.fillStyle = color;
	context.fill();
}

function globestroke(obj, color) {
	context.beginPath();
	path(obj);
	context.strokeStyle = color;
	context.stroke();
}

function enter(country) {
	country = countryList.find(function (c) {
		return c.id === country.id;
	});
	current.text(country && country.name || '');
	currentGlobeCountry = country;
}

function leave(country) {
	current.text('');
	currentGlobeCountry = undefined;
}

function UpdateGlobe(data) {
	console.log("update Glopbe Called");
	// var b = countries.features;
	// var ab = countryList;
	// var abc = globeColors;
	globeColors = data;

}

function startRotation(delay) {
	autorotate.restart(rotate, delay || 0);
}

function stopRotation() {
	autorotate.stop();
}

function ProcessDataReceived(data) {
	CleraAllFilterButtons();
	BtnNoFilter.class('btn-primary');
	if (data != null && data != undefined) {
		ALLTWEETS = data.tweets; //Store tweets
		UpdateTwitterFeed(data.tweets);
		UpdateMap(data.map);
		UpdateGlobe(data.globe);
	} else {
		alert("No data Received from server");
	}
	$('#myModal').modal('hide');
	$('#cover-spin').hide(0);
}

function UpdateTwitterFeed(tweets) {
	//Twitter Feed
	var tweetList = select('#twitterFeed');
	while (tweetList.elt.childNodes.length > 0) {
		tweetList.elt.childNodes.forEach(node => {
			// tweetList.elt.removeChild(node);
			node.remove();
		});
	}
	

	if (tweets != undefined) {
		var bgCount = 0;

		tweets.forEach(tweet => {
			bgCount++;
			var link = createA(tweet.tweetURL, "         Click for full tweet", "_blank");
			if (isEven(bgCount))
				link.parent(createElement('div', (FormattedScore(tweet.comparative) + ": " + tweet.tweetText)).class('list-group-item list-group-item-info').parent(tweetList));
			else
				link.parent(createElement('div', (FormattedScore(tweet.comparative) + ": " + tweet.tweetText)).class('list-group-item').parent(tweetList));

		});
	}
}
//Globe
document.addEventListener("DOMContentLoaded", function () {


	function setAngles() {
		if (projection != undefined) {

			var rotation = projection.rotate();
			rotation[0] = angles.y;
			rotation[1] = angles.x;
			rotation[2] = angles.z;
			projection.rotate(rotation);
		}
	}

	function scale() {
		width = document.documentElement.clientWidth - 500;
		height = document.documentElement.clientHeight;
		if (canvas != undefined) {
			
			map.resize(width, height);
			var z = select('#frame');
			var z1 = z.parent; // canvas.parent.width;
			canvas.attr('width', width).attr('height', height);
			projection
				.scale((scaleFactor * Math.min(width, height)) / 2)
				.translate([width / 2, height / 2]);
			render();
		}
	}

	function rotate(elapsed) {
		now = d3version4.now();
		diff = now - lastTime;
		if (diff < elapsed && canvas != null) {
			rotation = projection.rotate();
			rotation[0] += diff * degPerMs;
			projection.rotate(rotation);
			render();
		}
		lastTime = now;
	}
	
	function loadData(cb) {
		d3version4.json('https://unpkg.com/world-atlas@1/world/110m.json', function (error, world) {
			if (error) throw error;
			d3version4.tsv('https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv', function (error, countries) {
				if (error) throw error;
				cb(world, countries);
			});
		});
	}

	setAngles();

	loadData(function (world, cList) {
		land = topojson.feature(world, world.objects.land);
		countries = topojson.feature(world, world.objects.countries);
		countryList = cList;

		countryList.forEach(country => {
			var c1 = new globeCountry(country.id, country.name, colorCountry);
			globeColors.push(c1);
		});
		window.addEventListener('resize', scale);
		scale();
		autorotate = d3version4.timer(rotate);
	});
});

class globeCountry {
	constructor(id, name, color) {
		this.id = id;
		this.name = name;
		this.color = color;
	}
}

function isEven(n) {
	return n % 2 == 0;
}

function Exists(field) {
	return (field != null && field != undefined && field != "");
}

function FormattedScore(score) {
	return parseFloat(Math.round(score * 100) / 100).toFixed(2);
}