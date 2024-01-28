import { app } from "@azure/functions";
import Ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import * as ffprobe from "ffprobe-static";
import * as ffmpeg from "ffmpeg-static";
import multipart from "parse-multipart-data";

Ffmpeg.setFfprobePath(ffprobe.path);
Ffmpeg.setFfmpegPath(ffmpeg.default);

function splitTextIntoLines(data) {
  const MaxChars = 80;
  const MaxDuration = 3.0;
  const MaxGap = 1.5;

  const subtitles = [];
  let line = [];
  let lineDuration = 0;
  let lineChars = 0;

  for (let idx = 0; idx < data.length; idx++) {
    const wordData = data[idx];
    const word = wordData.word;
    const start = wordData.start;
    const end = wordData.end;

    line.push(wordData);
    lineDuration += end - start;

    const temp = line.map((item) => item.word).join(" ");

    const newLineChars = temp.length;

    const durationExceeded = lineDuration > MaxDuration;
    const charsExceeded = newLineChars > MaxChars;
    let maxGapExceeded = false;

    if (idx > 0) {
      const gap = start - data[idx - 1].end;
      maxGapExceeded = gap > MaxGap;
    }

    if (durationExceeded || charsExceeded || maxGapExceeded) {
      if (line.length > 0) {
        const subtitleLine = {
          word: line.map((item) => item.word).join(" "),
          start: line[0].start,
          end: line[line.length - 1].end,
          textcontents: line,
        };
        subtitles.push(subtitleLine);
        line = [];
        lineDuration = 0;
        lineChars = 0;
      }
    }
  }

  if (line.length > 0) {
    const subtitleLine = {
      word: line.map((item) => item.word).join(" "),
      start: line[0].start,
      end: line[line.length - 1].end,
      textcontents: line,
    };
    subtitles.push(subtitleLine);
  }

  return subtitles;
}

function createCaption(
  textJSON,
  frameSize,
  font = "Helvetica-Bold",
  fontsize = 80,
  color = "white",
  bgcolor = "blue"
) {
  const wordcount = textJSON.textcontents.length;
  const fullDuration = textJSON.end - textJSON.start;

  const wordClips = [];
  const xyTextClipsPositions = [];

  let x_pos = 0;
  let y_pos = 0;
  const frameWidth = frameSize[0];
  const frameHeight = frameSize[1];
  const x_buffer = (frameWidth * 1) / 10;
  const y_buffer = (frameHeight * 1) / 5;

  for (let index = 0; index < textJSON.textcontents.length; index++) {
    const wordJSON = textJSON.textcontents[index];
    const duration = wordJSON.end - wordJSON.start;

    const wordClip = Ffmpeg()
      .input(`color=${color}:s=${frameWidth}x${frameHeight}:r=24`)
      .videoCodec("libx264")
      .inputOptions("-framerate 24")
      .outputOptions(
        `-vf drawtext=text='${
          wordJSON.word
        }':fontfile=${font}:fontsize=${fontsize}:x=${x_pos + x_buffer}:y=${
          y_pos + y_buffer
        }:fontcolor=${color}:box=1:boxcolor=${bgcolor}`
      )
      .setStartTime(textJSON.start)
      .setDuration(fullDuration);

    wordClips.push(wordClip);

    const spaceClip = Ffmpeg()
      .input(`color=${color}:s=${frameWidth}x${frameHeight}:r=24`)
      .videoCodec("libx264")
      .inputOptions("-framerate 24")
      .outputOptions(
        `-vf drawtext=text=' ':fontfile=${font}:fontsize=${fontsize}:x=${
          x_pos + x_buffer + frameWidth
        }:y=${y_pos + y_buffer}:fontcolor=${color}:box=1:boxcolor=${bgcolor}`
      )
      .setStartTime(textJSON.start)
      .setDuration(fullDuration);

    wordClips.push(spaceClip);

    const wordWidth = wordJSON.width;
    const spaceWidth = spaceClip.size;

    if (x_pos + wordWidth + spaceWidth > frameWidth - 2 * x_buffer) {
      // Move to the next line
      x_pos = 0;
      y_pos = y_pos + wordJSON.height + 40;

      xyTextClipsPositions.push({
        x_pos: x_pos + x_buffer,
        y_pos: y_pos + y_buffer,
        width: wordWidth,
        height: wordJSON.height,
        word: wordJSON.word,
        start: wordJSON.start,
        end: wordJSON.end,
        duration: duration,
      });

      wordClip.setVideoFilters(
        `drawtext=text='${
          wordJSON.word
        }':fontfile=${font}:fontsize=${fontsize}:x=${x_pos + x_buffer}:y=${
          y_pos + y_buffer
        }:fontcolor=${color}:box=1:boxcolor=${bgcolor}`
      );
      spaceClip.setVideoFilters(
        `drawtext=text=' ':fontfile=${font}:fontsize=${fontsize}:x=${
          x_pos + x_buffer + wordWidth
        }:y=${y_pos + y_buffer}:fontcolor=${color}:box=1:boxcolor=${bgcolor}`
      );
      x_pos = wordWidth + spaceWidth;
    } else {
      xyTextClipsPositions.push({
        x_pos: x_pos + x_buffer,
        y_pos: y_pos + y_buffer,
        width: wordWidth,
        height: wordJSON.height,
        word: wordJSON.word,
        start: wordJSON.start,
        end: wordJSON.end,
        duration: duration,
      });

      wordClip.setVideoFilters(
        `drawtext=text='${
          wordJSON.word
        }':fontfile=${font}:fontsize=${fontsize}:x=${x_pos + x_buffer}:y=${
          y_pos + y_buffer
        }:fontcolor=${color}:box=1:boxcolor=${bgcolor}`
      );
      spaceClip.setVideoFilters(
        `drawtext=text=' ':fontfile=${font}:fontsize=${fontsize}:x=${
          x_pos + x_buffer + wordWidth
        }:y=${y_pos + y_buffer}:fontcolor=${color}:box=1:boxcolor=${bgcolor}`
      );
      x_pos = x_pos + wordWidth + spaceWidth;
    }
  }

  for (const highlightWord of xyTextClipsPositions) {
    const wordClipHighlight = Ffmpeg()
      .input(`color=${bgcolor}:s=${frameWidth}x${frameHeight}:r=24`)
      .videoCodec("libx264")
      .inputOptions("-framerate 24")
      .outputOptions(
        `-vf drawtext=text='${highlightWord.word}':fontfile=${font}:fontsize=${fontsize}:x=${highlightWord.x_pos}:y=${highlightWord.y_pos}:fontcolor=${color}:box=1:boxcolor=${bgcolor}`
      )
      .setStartTime(highlightWord.start)
      .setDuration(highlightWord.duration);

    wordClips.push(wordClipHighlight);
  }

  return wordClips;
}

async function processVideo() {
  const audioFile = "audio_short.wav";
  const videoFile = "short.mp4";
  const imageFile = "1704314188726.png";

  // Load the audio file
  const audio = await Ffmpeg(audioFile);

  // Load the image file and set its duration same as the audio
  const clip = await Ffmpeg(imageFile).setDuration(audio.duration);

  // Set the audio of the clip
  clip.audioCodec(audio);

  // Export the clip
  await clip.output(videoFile);

  console.log("Video created successfully");
  await processTranscription();
}

async function processTranscription() {
  const audioFile = "audio_short.mp3";
  const options = {
    modelName: "base.en",
    whisperOptions: {
      word_timestamps: true,
    },
  };
  const translation = await openai.audio.translations.create({
    file: fs.createReadStream(audioFile),
    model: "whisper-1",
    response_format: "verbose_json",
  });

  console.log(translation.text);
  const transcript = await whisper.whisper(audioFile);
  console.log(transcript);
  const result = await whisper.whisper(audioFile, options);

  const wordLevelInfo = [];

  for (const segment of result.segments) {
    for (const word of segment.words) {
      wordLevelInfo.push({
        word: word.word.trim(),
        start: word.start,
        end: word.end,
      });
    }
  }

  fs.writeFileSync("data.json", JSON.stringify(wordLevelInfo, null, 4));

  const lineLevelSubtitles = splitTextIntoLines(wordLevelInfo);
  const allLineLevelSplits = [];

  for (const line of lineLevelSubtitles) {
    const out = createCaption(line, frameSize);
    allLineLevelSplits.push(...out);
  }

  await processVideoOverlay(allLineLevelSplits);
}

async function processVideoOverlay(allLineLevelSplits) {
  const inputVideo = "short.mp4";
  const outputVideo = "output.mp4";

  const metadata = await Ffmpeg.ffprobe(inputVideo);
  const inputVideoDuration = metadata.format.duration;

  const backgroundClip = await Ffmpeg()
    .videoCodec("libx264")
    .inputOptions("-framerate 24")
    .input("color=c=black:s=1080x1080:r=24")
    .duration(inputVideoDuration);

  await Ffmpeg()
    .input(backgroundClip)
    .input(allLineLevelSplits)
    .concatenate()
    .videoCodec("libx264")
    .audioCodec("aac")
    .save(outputVideo);

  console.log("Overlay video created successfully");
}

async function getFormFiles(request, context) {
  try {
    const buffer = await request.arrayBuffer();
    const boundary = multipart.getBoundary(request.headers.get("Content-Type"));
    return multipart.parse(Buffer.from(buffer), boundary);
  } catch (error) {
    context.log(`Error in getFormFiles: ${error}`);
    throw error;
  }
}

async function CreateVideoFromAudio(request, context) {
  try {
    context.log(`Http function processed request for url "${request.url}"`);
    const form = await getFormFiles(request, context);
    console.log(form);

    return {
      status: 200,
      body: "Warmed up",
    };
  } catch (error) {
    context.log(`Error in Trigger Warmup function: ${error}`);

    return {
      status: 500,
      body: "Internal server error",
    };
  }
}

app.http("CreateVideoFromAudio", {
  methods: ["POST"],
  authLevel: "function",
  handler: CreateVideoFromAudio,
});
