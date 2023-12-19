import { app } from '@azure/functions';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';

app.http('MergeAudio', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const fileDataArray = request.body?.files;
        if (!fileDataArray || !Array.isArray(fileDataArray) || fileDataArray.length < 2) {
            return { status: 400, body: "Please provide an array of at least two file data objects in the 'files' parameter." };
        }

        try {
            const tempDir = os.tmpdir();
            const tempFiles = [];

            for (const [index, fileData] of fileDataArray.entries()) {
                const filePath = path.join(tempDir, `file${index}.mp3`);
                fs.writeFileSync(filePath, fileData);
                tempFiles.push(filePath);
            }

            const outputPath = path.join(tempDir, 'merged.mp3');
            await mergeMP3Files(tempFiles, outputPath);

            const mergedFileData = fs.readFileSync(outputPath);

            tempFiles.forEach(file => fs.unlinkSync(file));
            fs.unlinkSync(outputPath);

            return {
                status: 200,
                headers: { 'Content-Type': 'audio/mpeg' },
                isRaw: true,
                body: mergedFileData
            };
        } catch (error) {
            context.log(error);
            return { status: 500, body: 'Internal Server Error' };
        }
    }
});

function mergeMP3Files(files, outputFile) {
    return new Promise((resolve, reject) => {
        ffmpeg.setFfmpegPath(ffmpegStatic);
        const merged = ffmpeg();
        files.forEach(file => merged.input(file));
        merged.on('error', function(err) {
                reject('An error occurred: ' + err.message);
            })
            .on('end', function() {
                resolve();
            })
            .mergeToFile(outputFile, os.tmpdir());
    });
}