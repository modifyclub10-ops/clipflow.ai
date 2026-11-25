CLIPFLOW — AI CLIPPING WEBSITE STARTER

FILES
- index.html: website layout
- styles.css: responsive styling
- script.js: upload selector, YouTube URL validation and import request
- server.js: optional Node.js API placeholder for the YouTube import workflow

OPEN IN VS CODE
1. Extract this ZIP.
2. Open the extracted folder in Visual Studio Code.
3. For the front-end preview, use the Live Server extension on index.html.

YOUTUBE LINK OPTION
The workspace now has two source tabs:
- Upload file
- YouTube link

The YouTube tab validates the URL and sends it to POST /api/youtube/import.
The included server.js is an API placeholder: it does NOT download a YouTube video.
YouTube does not provide a general-purpose download endpoint through its standard
Data API, and downloading videos may be restricted by YouTube's terms and copyright.
Only import videos you own or have permission to use, through a compliant/authorized
media source provider.

RUN THE OPTIONAL API PLACEHOLDER
1. Install Node.js.
2. In VS Code terminal, run: node server.js
3. The API listens on http://localhost:3000.
4. Serve the front end from the same origin / configure your dev proxy before testing.
   The included API CORS setting is a simple local-development example.

WHAT IS STILL NEEDED FOR REAL CLIPPING
- An authorized way to obtain the source video file
- Backend storage and job handling
- Speech-to-text/transcription
- AI highlight selection
- Video rendering/cropping and caption burn-in
- Download/export of the generated clips

The current front-end does not claim that a video has been downloaded or clipped.
