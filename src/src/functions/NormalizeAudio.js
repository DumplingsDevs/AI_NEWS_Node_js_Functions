import { app } from "@azure/functions";
import Ffmpeg from "fluent-ffmpeg";
import multipart from "parse-multipart";
import os from "os";
import path from "path";
import fs from "fs";
import * as ffprobe from "ffprobe-static";
import * as ffmpeg from "ffmpeg-static";

async function NormalizeAudio(request, context) {
    try {
        context.log(`Http function processed request for url "${request.url}"`);

        Ffmpeg.setFfprobePath(ffprobe.path);

        const eValue = 12.5;
        const rValue = 0.0001;
        const lValue = 1;
        const bitrate = "192k";

        const contentType = request.headers.get("Content-Type");
        if (!contentType || !contentType.includes("multipart/form-data")) {
            context.log('Invalid content type. Expecting multipart/form-data.');
            return {
                status: 400,
                body: "Invalid content type. Expecting multipart/form-data."
            };
        }

        const files = await getFormFiles(request, context);

        if (files.length !== 1) {
            context.log('Error: Incorrect number of files provided');
            return {
                status: 400,
                body: "Exactly one file is required for normalization"
            };
        }

        const tempDir = os.tmpdir();
        const originalFilePath = path.join(tempDir, 'original.mp3');
        fs.writeFileSync(originalFilePath, files[0].data);

        const normalizedFilePath = path.join(tempDir, 'normalized.mp3');
        await normalizeAudioFile(originalFilePath, normalizedFilePath, bitrate, eValue, rValue, lValue, context);

        const normalizedFileData = fs.readFileSync(normalizedFilePath);

        fs.unlinkSync(originalFilePath);
        fs.unlinkSync(normalizedFilePath);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "content-disposition": `attachment;filename=normalized_${formatCurrentDateTime()}.mp3`,
            },
            body: normalizedFileData,
        };
    } catch (error) {
        context.log(`Error in NormalizeAudio function: ${error}`);

        return {
            status: 500,
            body: "Internal server error",
        };
    }
}

app.http("NormalizeAudio", {
    methods: ["POST"],
    authLevel: "function",
    handler: NormalizeAudio,
});

function normalizeAudioFile(inputFile, outputFile, bitrate, eValue, rValue, lValue, context) {
    return new Promise((resolve, reject) => {
        try {
            Ffmpeg.setFfmpegPath(ffmpeg.default);
            Ffmpeg(inputFile)
                .audioBitrate(bitrate)
                .audioFilters(`speechnorm=e=${eValue}:r=${rValue}:l=${lValue}`)
                .on("error", function (err) {
                    context.log(`Error normalizing file: ${err.message}`);
                    reject("An error occurred: " + err.message);
                })
                .on("end", function () {
                    resolve(true);
                })
                .save(outputFile);
        } catch (error) {
            context.log(`Error in normalizeAudioFile: ${error}`);
            reject(error);
        }
    });
}

// THIS IS EXACTLY SAME CODE AS IN MERGE AUDIO - TO DO Make it reusable
async function getFormFiles(request, context) {
    try {
        const buffer = await request.arrayBuffer();
        const boundary = multipart.getBoundary(request.headers.get("Content-Type"));
        return multipart.Parse(Buffer.from(buffer), boundary);
    } catch (error) {
        context.log(`Error in getFormFiles: ${error}`);
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