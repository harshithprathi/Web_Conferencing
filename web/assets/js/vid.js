const MEETING_SERVICE = "https://turbuchb74.execute-api.us-east-1.amazonaws.com/bytes-meeting";

var isMeetingHost = false;
var meetingId = "";
var attendeeId = "";
var userName = "";
var clientId = "";
var isScreenShared = false;
const attendees = new Set();

var urlParams = new URLSearchParams(window.location.search);

// meetingId will be available if a user tries to join a meeting via a meeting URL
meetingId = urlParams.get("meetingId");

const muteAudioButton = document.getElementById("mute-audio");
const unmuteAudioButton = document.getElementById("unmute-audio");

muteAudioButton.addEventListener("click", () => {
  if (window.meetingSession) {
    window.meetingSession.audioVideo.realtimeMuteLocalAudio();
	alert("You are now muted");
  }
});

unmuteAudioButton.addEventListener("click", () => {
  if (window.meetingSession) {
    window.meetingSession.audioVideo.realtimeUnmuteLocalAudio();
	alert("You mic is now on");
  }
});

// Generate a unique client Id for the user
clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

let requestPath = MEETING_SERVICE + `?clientId=${clientId}`;

// Setup logger
const logger = new window.ChimeSDK.ConsoleLogger(
	"ChimeMeetingLogs",
	ChimeSDK.LogLevel.INFO
);

const deviceController = new ChimeSDK.DefaultDeviceController(logger);

// If meetingId is not available, then user is the meeting host.
if (!meetingId) {
	isMeetingHost = true;
}

var startButton = document.getElementById("start-button");
var stopButton = document.getElementById("stop-button");
var exitButton = document.getElementById("exit-button");
var shareButton = document.getElementById("share-button");

if (isMeetingHost) {
	startButton.innerText = "Start Meeting";
	stopButton.style.display = "inline-block";
} else {
	startButton.innerText = "Join Meeting";
	exitButton.style.display = "inline-block";
	requestPath += `&meetingId=${meetingId}`;
}

startButton.style.display = "inline-block";
shareButton.style.display = "inline-block";

// Create or Join Meeting
async function doMeeting() {
	userName = document.getElementById("username").value;
	if (userName.length == 0) {
		alert("Please enter username");
		return;
	}

	if (userName.indexOf("#") >= 0) {
		alert("Please do not use special characters in User Name");
		return;
	}

	//If Meeting session already present, return.
	if (window.meetingSession) {
		//alert("Meeting already in progress");
		return;
	}
	try {
		//Send request to service(API Gateway > Lambda function) to start/join meeting.
		var response = await fetch(requestPath, {
			method: "POST",
			headers: new Headers(),
			body: JSON.stringify({ action: "DO_MEETING", MEETING_ID: `${meetingId}`, USERNAME: `${userName}` })
		});

		const data = await response.json();
		
		if (! data.hasOwnProperty('Info')) {
			alert("Oops! The meeting might have ended!");
			console.log("Meeting was not Found");	
			return;
		}

		meetingId = data.Info.Meeting.Meeting.MeetingId;
		attendeeId = data.Info.Attendee.Attendee.AttendeeId;

		document.getElementById("meeting-Id").innerText = meetingId;
		if (isMeetingHost) {
			document.getElementById("meeting-link").innerText = window.location.href + "?meetingId=" + meetingId;
		}
		else
		{
			document.getElementById("meeting-link").innerText = window.location.href;
		}

		const configuration = new ChimeSDK.MeetingSessionConfiguration(
			data.Info.Meeting.Meeting,
			data.Info.Attendee.Attendee
		);
		window.meetingSession = new ChimeSDK.DefaultMeetingSession(
			configuration,
			logger,
			deviceController
		);

		// Initialize Audio Video
		const audioInputs = await meetingSession.audioVideo.listAudioInputDevices();
		const videoInputs = await meetingSession.audioVideo.listVideoInputDevices();

		await meetingSession.audioVideo.startAudioInput(audioInputs[0].deviceId);
		await meetingSession.audioVideo.startVideoInput(videoInputs[0].deviceId);

		const observer = {
			// Tile State changed, so let's examine it.
			videoTileDidUpdate: (tileState) => {
				// if no attendeeId bound to tile, ignore it return
				if (!tileState.boundAttendeeId) {
					return;
				}
				//There is an attendee Id against the tile, and it's a valid meeting session, then update tiles view
				if (!(meetingSession === null)) {
					updateTiles(meetingSession);
				}
			},
		};

		const eventObserver = {
			// Check for events of interest for eg. Meeting End.
			eventDidReceive(name, attributes) {
				switch (name) {
					case 'meetingEnded':
					  cleanup();
					  console.log("NOTE: Meeting Ended", attributes);
					  break;
					case 'meetingReconnected':
					  console.log('NOTE: Meeting Reconnected...');
					  break;
			}
		  }
		}

		// Add observers for the meeting session
		meetingSession.audioVideo.addObserver(observer);
		meetingSession.audioVideo.realtimeSubscribeToAttendeeIdPresence(attendeeObserver);
		meetingSession.eventController.addObserver(eventObserver);

		const audioOutputElement = document.getElementById("meeting-audio");
		meetingSession.audioVideo.bindAudioElement(audioOutputElement);
		meetingSession.audioVideo.start();
		meetingSession.audioVideo.startLocalVideoTile();
	}
	catch (err) {
		console.error("Error: " + err);
	}
}

// Update Video Tiles on UI view
function updateTiles(meetingSession) {
	const tiles = meetingSession.audioVideo.getAllVideoTiles();
	tiles.forEach(tile => {
		let tileId = tile.tileState.tileId
		var divElement = document.getElementById("div-" + tileId);
		// If divElement not found.
		if (!divElement) {
			// Create divElement. Give it a unique id and name
			divElement = document.createElement("div");
			divElement.id = "div-" + + tileId;
			divElement.setAttribute("name", "div-" + tile.tileState.boundAttendeeId);
			divElement.style.display = "inline-block";
			divElement.style.padding = "5px";

			// Create videoElement. Give it a unique id
			videoElement = document.createElement("video");
			videoElement.id = "video-" + tileId;
			videoElement.setAttribute("name", "video-" + tile.tileState.boundAttendeeId);
			videoElement.controls = true;

			// Create 'p' element for user name to display above video tile.
			tileUserName = document.createElement("p");
			tileUserName.style.color="white";
			boundExtUserId = tile.tileState.boundExternalUserId
			tileUserName.textContent = boundExtUserId.substring(0, boundExtUserId.indexOf("#"));

			// Append appropriately
			divElement.append(tileUserName);
			divElement.append(videoElement);
			document.getElementById("video-list").append(divElement);

			meetingSession.audioVideo.bindVideoElement(
				tileId,
				videoElement
			);
		}
	})
}

// Attendee presence check
// Update the attendees set and div video tiles display based on this.
function attendeeObserver(attendeeId, present, externalUserId, dropped, posInFrame) {

	//Get Attendee User Name from externalUserId where it was set while joining meeting
	attendeeUserName = externalUserId.substring(0, externalUserId.indexOf("#"));

	// If attendee 'present' is true, add to attendees set.
	if (present) {
		attendees.add(attendeeUserName);
	}
	else {
		// Attendee no longer 'present', remove the attendee display div with video tile
		const elements = document.getElementsByName("div-" + attendeeId);
		elements[0].remove();

		// For screen share attendeeId comes with #content suffix.
		// Do not remove user from attendees if this is screen share closure update
		if (!(attendeeId.indexOf("#content") >= 0)) {
			attendees.delete(attendeeUserName);
		}
	}

	refreshAttendeesDisplay();
};

// Refresh attendee list in UI view
function refreshAttendeesDisplay()
{
	//Create list of attendees from attendees set, and then display.
	attendeeStr = "";
	for (const item of attendees) {
		attendeeStr = attendeeStr + item + " | ";
	}
	attendeeStr = attendeeStr.slice(0, -3);

	document.getElementById("Attendees").innerText = attendeeStr;
}

// Stop Meeting		
async function stopMeeting() {
	//Send request to service(API Gateway > Lambda function) to end the Meeting
	try {
		var response = await fetch(requestPath, {
			method: "POST",
			headers: new Headers(),
			body: JSON.stringify({ action: "END_MEETING", MEETING_ID: `${meetingId}` })
		});

		const data = await response.json();
		console.log("NOTE: END MEETING RESPONSE " + JSON.stringify(data));
		//meetingSession.deviceController.destroy();
		alert("Meeting ended successfully");

		cleanup();
	}
	catch (err) {
		console.error("NOTE Error: " + err);
	}
}

// Leave Meeting
async function exitMeeting() {
	//Send request to service(API Gateway > Lambda function) to delete Attendee Id from meeting.
	try {
		var response = await fetch(requestPath, {
			method: "POST",
			headers: new Headers(),
			body: JSON.stringify({ action: "DELETE_ATTENDEE", MEETING_ID: `${meetingId}`, ATTENDEE_ID: `${attendeeId}` })
		});

		const data = await response.json();
		console.log("NOTE: END MEETING RESPONSE " + JSON.stringify(data));
		//meetingSession.deviceController.destroy();
		alert("Successfully left the meeting");
		cleanup();
	}
	catch (err) {
		console.error("Error: " + err);
	}
}

// Reset 
function cleanup()
{
	meetingSession.deviceController.destroy();
	window.meetingSession = null;
	//if meeting host - don't preserve the meeting id.
	if (isMeetingHost)
	{
		meetingId = null;
	}
	document.getElementById("video-list").replaceChildren();
	attendees.clear();
	document.getElementById("meeting-link").innerText = "";
	refreshAttendeesDisplay();
}

// Toggle Screen Share
async function share() {
	try {
		if (window.meetingSession) {
			if (isScreenShared) {
				await meetingSession.audioVideo.stopContentShare();
				shareButton.innerText = "Start Screen Share";
				isScreenShared = false;
			}
			else {
				await meetingSession.audioVideo.startContentShareFromScreenCapture();
				shareButton.innerText = "Stop Screen Share";
				isScreenShared = true;
			}
		}
		else {
			alert("Please start or join a meeting first!");
		}
	}
	catch (err) {
		console.error("Error: " + err);
	}
}



window.addEventListener("DOMContentLoaded", () => {

	startButton.addEventListener("click", doMeeting);

	if (isMeetingHost) {
		stopButton.addEventListener("click", stopMeeting);
	}
	else {
		exitButton.addEventListener("click", exitMeeting);
	}

	shareButton.addEventListener("click", share);
});

// function turnOffVideo() {
// 	const videoFeed = document.getElementById("video-list");
// 	console.log("Turning off video", videoFeed);
// 	videoFeed.style.display = "none"; // Hide the video feed container
//   }
  
//   // Function to turn on video
// function turnOnVideo() {
// 	const videoFeed = document.getElementById("video-list");
// 	console.log("Turning on video", videoFeed);
// 	videoFeed.style.display = "block"; // Show the video feed container
//   }
function turnOffVideo() {
	const videoFeed = document.getElementById("div-1"); // Adjust the element ID as needed
	const feed=document.getElementById("video-list")
	console.log("listoff",feed);

	if (videoFeed) {
	  videoFeed.style.display = "none"; // Hide the specific video element
	}
  }
  
  // Function to turn on video
function turnOnVideo() {
	const videoFeed = document.getElementById("div-1"); // Adjust the element ID as needed
	const feed=document.getElementById("video-list")
	console.log("liston", feed);
	if (videoFeed) {
	  videoFeed.style.display = "block"; // Show the specific video element
	}
  }
  
  // Add event listeners for "off-button" and "on-button"
  const offButton = document.getElementById("off-button");
  const onButton = document.getElementById("on-button");
  
  if (offButton) {
	offButton.addEventListener("click", turnOffVideo);
  }
  
  if (onButton) {
	onButton.addEventListener("click", turnOnVideo);
  }
  
  

const mediaRecorders = [];

// Add references to the "record" and "stop" buttons
const recordButton = document.getElementById("record");
const stopvideoButton = document.getElementById("stop");

// Function to start recording for a specific video feed
function startRecording(videoFeed, divID) {
	// Create a media recorder for the video feed
	const mediaRecorder = new MediaRecorder(videoFeed.captureStream());
	mediaRecorders.push(mediaRecorder);

	// Create an array to store recorded chunks for this session
	let recordedChunks = [];

	// Listen for dataavailable event to collect video data
	mediaRecorder.addEventListener("dataavailable", (event) => {
		if (event.data.size > 0) {
			recordedChunks.push(event.data);
		}
	});

	// Start recording
	mediaRecorder.start();

	// Listen for stop event to save and display the recorded video
	mediaRecorder.addEventListener("stop", () => {
		if (recordedChunks.length > 0) {
			// Create a blob from the recorded chunks
			const blob = new Blob(recordedChunks, { type: "video/webm" });

			// Create a video element to display the recorded video
			const videoElement = document.createElement("video");
			videoElement.controls = true;
			videoElement.src = URL.createObjectURL(blob);

			// Append the video element to the "recorded-videos" container
			const recordedVideosContainer = document.getElementById("recorded-videos");
			recordedVideosContainer.appendChild(videoElement);
			console.log("recvideocont",recordedVideosContainer);
		}
	});
}

// Function to stop all media recorders
function stopRecording() {
	mediaRecorders.forEach((mediaRecorder) => {
		if (mediaRecorder.state !== "inactive") {
			mediaRecorder.stop();
		}
	});
	alert("Screen Recording ended successfully");
}

// Add a click event listener to the "record" button
recordButton.addEventListener("click", () => {
	// Start recording for each video feed
	const divGroups = {};

	// Get all the div elements within the specified container (e.g., "video-list")
	const container = document.getElementById("video-list");
	const divElements = container.querySelectorAll("div");

	// Iterate through the div elements
	divElements.forEach((divElement) => {
		// Find the paragraph element within the div
		const paragraph = divElement.querySelector("p");
		const videoElement = divElement.querySelector("video");
		if (paragraph && videoElement) {
			// Get the text content of the paragraph
			const paragraphText = paragraph.textContent.trim();

			// If the paragraph text is common, add the div ID to the corresponding group
			if (paragraphText) {
				// divGroups[paragraphText] = divElement.id;
				if (!divGroups[paragraphText]) {
					divGroups[paragraphText] = [];
				  }
				// divGroups[paragraphText] = videoElement;
				divGroups[paragraphText].push(videoElement);
			}
		}
	});

	// Start recording for each group
	for (const textContent in divGroups) {
		if (divGroups.hasOwnProperty(textContent)) {
			// const divID = divGroups[textContent];
			// const videoFeed = document.getElementById(divID); // Adjust the element ID as needed
			// console.log("divID: " + divID, "videoFeed: " + videoFeed, "div2", document.getElementById("div-2"));
			// startRecording(videoFeed, divID);
			const videoElements = divGroups[textContent];
			if (videoElements.length >= 2) {
				const videoFeed = videoElements[videoElements.length - 1];
				console.log("videoFeed: ", videoFeed);
				startRecording(videoFeed, videoFeed.id);
			}
			// const videoFeed = divGroups[textContent];
			
		}
	}
	alert("Screen Recording Started");
	recordButton.disabled = true;
	stopvideoButton.disabled = false;
});

// Add a click event listener to the "stop" button
stopvideoButton.addEventListener("click", () => {
	// Stop all media recorders
	stopRecording();
	recordButton.disabled = false;
	stopvideoButton.disabled = true;
});