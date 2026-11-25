require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const OpenAI = require('openai');

// --- FFmpeg Setup for Render ---
const ffmpegPath = require('ffmpeg-static');
process.env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH}`;
// -------------------------------

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/outputs', express.static('outputs'));

['uploads', 'outputs'].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d));

const hasKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY';
const openai = hasKey ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000 // 2 minutes timeout for long videos
}) : null;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(mp4|mov|avi|mkv|webm)$/i.test(file.originalname);
    cb(ok ? null : new Error('Sirf video file chahiye'), ok);
  }
});

async function extractAudio(video, audio) {
  await execAsync(`ffmpeg -y -i "${video}" -vn -acodec libmp3lame -ar 16000 -ac 1 "${audio}"`);
}

async function transcribe(audio) {
  if (!openai) return null;
  return await openai.audio.transcriptions.create({
    file: fs.createReadStream(audio),
    model: 'whisper-1',
    response_format: 'verbose_json'
  });
}

async function findMoments(transcript, count) {
  if (!openai || !transcript) return null;
  const text = transcript.segments.map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join('\n');
  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Transcript se ${count} sabse engaging 30-60 second moments chun kar SIRF JSON return karein: {"clips":[{"start":12.5,"end":45.2,"title":"..."}]}. Koi extra text nahi.\n\n${text}`
    }],
    response_format: { type: 'json_object' }
  });
  const parsed = JSON.parse(resp.choices[0].message.content);
  return parsed.clips;
}

function formatTime(seconds) {
  const date = new Date(0);
  date.setSeconds(seconds);
  const ms = Math.floor((seconds % 1) * 1000);
  const time = date.toISOString().substr(11, 8);
  return `${time},${ms.toString().padStart(3, '0')}`;
}

function createSRT(segments, clipStart, clipEnd, srtPath) {
  let srtContent = '';
  let index = 1;
  for (const seg of segments) {
    if (seg.start >= clipStart && seg.end <= clipEnd) {
      const newStart = seg.start - clipStart;
      const newEnd = seg.end - clipStart;
      srtContent += `${index}\n${formatTime(newStart)} --> ${formatTime(newEnd)}\n${seg.text.trim()}\n\n`;
      index++;
    }
  }
  fs.writeFileSync(srtPath, srtContent);
}

app.post('/api/process', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Video nahi mili' });
    const videoPath = req.file.path;
    const base = path.parse(req.file.filename).name;
    const audioPath = `uploads/${base}.mp3`;
    const wanted = parseInt(req.body.clipCount) || 3;
    const wantCaptions = req.body.captions === 'true'; 

    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`);
    const total = parseFloat(stdout.trim());

    await extractAudio(videoPath, audioPath);
    const transcript = await transcribe(audioPath);
    let moments = await findMoments(transcript, wanted);

    if (!moments || moments.length === 0) {
      const d = Math.min(60, total / wanted);
      moments = [];
      for (let i = 0; i < wanted; i++) {
        moments.push({
          start: i * d,
          end: Math.min((i + 1) * d, total),
          title: `Clip ${i + 1}`
        });
      }
    }

    const clips = [];
    for (let i = 0; i < moments.length; i++) {
      const m = moments[i];
      const dur = m.end - m.start;
      const final = `outputs/${base}_clip_${i}.mp4`;
      
      let subtitleFilter = '';
      let srtPath = '';

      if (wantCaptions && transcript && transcript.segments) {
        srtPath = `outputs/${base}_clip_${i}.srt`;
        createSRT(transcript.segments, m.start, m.end, srtPath);
        subtitleFilter = `,subtitles=${srtPath}:force_style='Fontname=Arial,Fontsize=20,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=100'`;
      }

      const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920${subtitleFilter}`;
      await execAsync(`ffmpeg -y -ss ${m.start} -i "${videoPath}" -t ${dur} -vf "${vf}" -c:a copy "${final}"`);

      if (srtPath && fs.existsSync(srtPath)) fs.unlinkSync(srtPath); 
      
      clips.push({ title: m.title || `Clip ${i + 1}`, url: `/${final}`, start: m.start, duration: dur });
    }

    fs.unlinkSync(videoPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    res.json({ clips });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
