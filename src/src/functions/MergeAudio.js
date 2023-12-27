import { app } from "@azure/functions";
import Ffmpeg from "fluent-ffmpeg";
import multipart from "parse-multipart";
import os from "os";
import path from "path";
import fs from "fs";
import * as ffprobe from "ffprobe-static";
import * as ffmpeg from "ffmpeg-static";

async function MergeAudio(request, context) {
  context.log(`Http function processed request for url "${request.url}"`);
  Ffmpeg.setFfprobePath(ffprobe.path);

  const files = await getFormFiles(request);
  const tempDir = os.tmpdir();
  const tempFiles = pushTempFiles(tempDir, files);
  const outputPath = path.join(os.tmpdir(), "merged.mp3");
  await mergeMP3Files(tempFiles, outputPath);

  const mergedFileData = fs.readFileSync(outputPath);

  tempFiles.forEach((file) => fs.unlinkSync(file));
  fs.unlinkSync(outputPath);

  return {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "content-disposition": `attachment;filename=output_${formatCurrentDateTime()}.mp3`,
    },
    body: mergedFileData,
  };
}

app.http("MergeAudio", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: MergeAudio,
});

app.http("MergeAudioV2", {
  methods: ["POST"],
  authLevel: "function",
  handler: MergeAudio,
});

function mergeMP3Files(files, outputFile) {
  return new Promise((resolve, reject) => {
    Ffmpeg.setFfmpegPath(ffmpeg.default);
    const merged = Ffmpeg();
    files.forEach((file) => merged.input(file).withAudioBitrate(192));
    merged
      .on("error", function (err) {
        reject("An error occurred: " + err.message);
      })
      .on("end", function () {
        resolve(true);
      })
      .mergeToFile(outputFile, os.tmpdir());
  });
}

async function getFormFiles(request) {
  const buffer = await request.arrayBuffer();
  const boundary = multipart.getBoundary(request.headers.get("Content-Type"));
  return multipart.Parse(Buffer.from(buffer), boundary);
}

function pushTempFiles(tempDir, files) {
  const tempFiles = [];

  files.forEach((file, index) => {
    const filePath = path.join(tempDir, `file${index}.mp3`);
    fs.writeFileSync(filePath, file.data);
    tempFiles.push(filePath);
  });

  return tempFiles;
}

function formatCurrentDateTime() {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());

  return `${hours}_${minutes}_${seconds}_${day}_${month}_${year}`;
}
