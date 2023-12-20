import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import * as Ffmpeg from "fluent-ffmpeg";
import * as multipart from "parse-multipart";
import * as os from "os";
import path = require("path");
import * as fs from "fs";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

export async function MergeAudio(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

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

const mergeMP3Files = (files, outputFile) => {
  return new Promise((resolve, reject) => {
    Ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    const merged = Ffmpeg();
    files.forEach((file) => merged.input(file));
    merged
      .on("error", function (err) {
        reject("An error occurred: " + err.message);
      })
      .on("end", function () {
        resolve(true);
      })
      .mergeToFile(outputFile, os.tmpdir());
  });
};

const getFormFiles = async (
  request: HttpRequest
): Promise<multipart.ParsedFile[]> => {
  const buffer = await request.arrayBuffer();
  const boundary = multipart.getBoundary(request.headers.get("Content-Type"));
  return multipart.Parse(Buffer.from(buffer), boundary);
};

const pushTempFiles = (
  tempDir: string,
  files: multipart.ParsedFile[]
): string[] => {
  const tempFiles = [];

  files.forEach((file, index) => {
    const filePath = path.join(tempDir, `file${index}.mp3`);
    fs.writeFileSync(filePath, file.data);
    tempFiles.push(filePath);
  });

  return tempFiles;
};

function formatCurrentDateTime(): string {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Dodaj 1, ponieważ miesiące są numerowane od 0 do 11
  const year = String(now.getFullYear());

  return `${hours}_${minutes}_${seconds}_${day}_${month}_${year}`;
}
