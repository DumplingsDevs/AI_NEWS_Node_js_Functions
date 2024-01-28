import { app } from "@azure/functions";
import Ffmpeg from "fluent-ffmpeg";
import multipart from "parse-multipart-data";
import os from "os";
import path from "path";
import fs from "fs";
import * as ffprobe from "ffprobe-static";
import * as ffmpeg from "ffmpeg-static";

async function MergeAudio(request, context) {
  try {
    context.log(`Http function processed request for url "${request.url}"`);
    Ffmpeg.setFfprobePath(ffprobe.path);

    const contentType = request.headers.get("Content-Type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      context.log("Invalid content type. Expecting multipart/form-data.");

      return {
        status: 400,
        body: "Invalid content type. Expecting multipart/form-data. Most probably you haven't attached any files in request body!",
      };
    }

    const files = await getFormFiles(request, context);

    if (files.length < 2) {
      context.log("Error: Less than 2 files provided");
      return {
        status: 400,
        body: "At least 2 files are required for merging",
      };
    }

    const tempDir = os.tmpdir();
    const tempFiles = pushTempFiles(tempDir, files, context);
    const outputPath = path.join(os.tmpdir(), "merged.mp3");
    await mergeMP3Files(tempFiles, outputPath, context);

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
  } catch (error) {
    context.log(`Error in MergeAudio function: ${error}`);

    return {
      status: 500,
      body: "Internal server error",
    };
  }
}

app.http("MergeAudio", {
  methods: ["POST"],
  authLevel: "function",
  handler: MergeAudio,
});

function mergeMP3Files(files, outputFile, context) {
  return new Promise((resolve, reject) => {
    try {
      Ffmpeg.setFfmpegPath(ffmpeg.default);
      const merged = Ffmpeg();
      files.forEach((file) => merged.input(file).withAudioBitrate(192));
      merged
        .on("error", function (err) {
          context.log.error(`Error merging files: ${err.message}`);
          reject("An error occurred: " + err.message);
        })
        .on("end", function () {
          resolve(true);
        })
        .mergeToFile(outputFile, os.tmpdir());
    } catch (error) {
      context.log(`Error in mergeMP3Files: ${error}`);
      reject(error);
    }
  });
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

function pushTempFiles(tempDir, files, context) {
  try {
    const tempFiles = [];

    files.forEach((file, index) => {
      const filePath = path.join(tempDir, `file${index}.mp3`);
      fs.writeFileSync(filePath, file.data);
      tempFiles.push(filePath);
    });

    return tempFiles;
  } catch (error) {
    context.log(`Error in pushTempFiles: ${error}`);
    throw error;
  }
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
