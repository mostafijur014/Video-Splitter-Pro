import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import fs from "fs-extra";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import archiver from "archiver";

// Configure FFmpeg paths
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
ffmpeg.setFfprobePath(ffprobeStatic.path);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use /tmp for uploads and outputs to be more compatible with restricted environments
  const UPLOADS_DIR = path.join("/tmp", "video-splitter", "uploads");
  const OUTPUTS_DIR = path.join("/tmp", "video-splitter", "outputs");
  await fs.ensureDir(UPLOADS_DIR);
  await fs.ensureDir(OUTPUTS_DIR);

  // Configure Multer
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const id = uuidv4();
      const dir = path.join(UPLOADS_DIR, id);
      fs.ensureDirSync(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  });

  // Increase limits for all types of requests
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // Request logger for debugging
  app.use((req, res, next) => {
    if (req.path === '/api/upload') {
      console.log(`Incoming upload: ${req.headers['content-length']} bytes`);
    }
    next();
  });

  // API routes
  app.get("/api", (req, res) => {
    res.json({ message: "Video Splitter Pro API is running" });
  });

  // Debug Endpoint
  app.get("/api/debug", async (req, res) => {
    try {
      const uploadsWritable = await fs.access(UPLOADS_DIR, fs.constants.W_OK).then(() => true).catch(() => false);
      const outputsWritable = await fs.access(OUTPUTS_DIR, fs.constants.W_OK).then(() => true).catch(() => false);
      
      res.json({
        status: "ok",
        version: "1.0.2",
        ffmpegPath: ffmpegStatic,
        ffprobePath: ffprobeStatic.path,
        uploadsDir: UPLOADS_DIR,
        outputsDir: OUTPUTS_DIR,
        uploadsWritable,
        outputsWritable,
        nodeVersion: process.version,
        env: process.env.NODE_ENV
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Chunked Upload
  app.post("/api/upload-chunk", upload.single("chunk"), async (req, res) => {
    const { jobId, chunkIndex, totalChunks, filename } = req.body;
    
    if (!req.file || !jobId || !chunkIndex || !totalChunks) {
      return res.status(400).json({ error: "Missing chunk data" });
    }

    const chunkDir = path.join(UPLOADS_DIR, jobId, "chunks");
    await fs.ensureDir(chunkDir);
    
    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
    await fs.move(req.file.path, chunkPath, { overwrite: true });

    const uploadedChunks = await fs.readdir(chunkDir);
    if (uploadedChunks.length === parseInt(totalChunks)) {
      // All chunks received, merge them
      const finalPath = path.join(UPLOADS_DIR, jobId, filename);
      const writeStream = fs.createWriteStream(finalPath);
      
      for (let i = 0; i < totalChunks; i++) {
        const partPath = path.join(chunkDir, `chunk_${i}`);
        const buffer = await fs.readFile(partPath);
        writeStream.write(buffer);
        await fs.remove(partPath);
      }
      
      writeStream.end();
      
      writeStream.on("finish", async () => {
        await fs.remove(chunkDir);
        
        // Now probe the merged file
        ffmpeg.ffprobe(finalPath, (probeErr, metadata) => {
          if (probeErr) {
            fs.remove(path.dirname(finalPath)).catch(console.error);
            return res.status(500).json({ 
              error: "Video analysis failed after merge",
              details: probeErr.message 
            });
          }
          
          res.json({
            status: "complete",
            jobId,
            duration: metadata.format.duration,
            filename: filename,
          });
        });
      });
    } else {
      res.json({ status: "chunk_received", received: uploadedChunks.length });
    }
  });

  // API: Upload and Get Info (Legacy/Small files)
  app.post("/api/upload", (req, res) => {
    console.log("Upload request received");
    const uploadSingle = upload.single("video");
    
    uploadSingle(req, res, (err) => {
      if (err) {
        console.error("Multer upload error:", err);
        const message = err instanceof multer.MulterError ? err.message : err.message;
        return res.status(err instanceof multer.MulterError ? 400 : 500).json({ 
          error: "Upload failed", 
          details: message 
        });
      }

      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const jobId = path.basename(path.dirname(filePath));

      console.log(`Probing file: ${filePath}`);
      ffmpeg.ffprobe(filePath, (probeErr, metadata) => {
        if (probeErr) {
          console.error("FFprobe error:", probeErr);
          // Clean up the failed upload
          fs.remove(path.dirname(filePath)).catch(console.error);
          
          return res.status(500).json({ 
            error: "Video analysis failed",
            details: probeErr.message 
          });
        }
        
        console.log("Probe successful", metadata.format.duration);
        res.json({
          jobId,
          duration: metadata.format.duration,
          filename: req.file?.originalname,
        });
      });
    });
  });

  // API: Split Video
  app.post("/api/split", async (req, res) => {
    const { jobId, filename, splitType, value } = req.body;

    if (!jobId || !filename || !value) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const inputPath = path.join(UPLOADS_DIR, jobId, filename);
    const outputJobDir = path.join(OUTPUTS_DIR, jobId);
    await fs.ensureDir(outputJobDir);

    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return res.status(500).json({ error: "Failed to probe video" });

      const totalDuration = metadata.format.duration || 0;
      let segmentTime = 0;

      if (splitType === "duration") {
        segmentTime = parseFloat(value);
      } else {
        const parts = parseInt(value);
        segmentTime = totalDuration / parts;
      }

      // Use ffmpeg to split
      // ffmpeg -i input.mp4 -c copy -map 0 -segment_time {duration} -f segment output_%03d.mp4
      ffmpeg(inputPath)
        .outputOptions([
          "-c copy",
          "-map 0",
          `-segment_time ${segmentTime}`,
          "-f segment",
          "-reset_timestamps 1"
        ])
        .output(path.join(outputJobDir, "part_%03d.mp4"))
        .on("start", (command) => {
          console.log("Spawned FFmpeg with command: " + command);
        })
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          res.status(500).json({ error: "Splitting failed" });
        })
        .on("end", async () => {
          const files = await fs.readdir(outputJobDir);
          const segments = files
            .filter(f => f.endsWith(".mp4"))
            .sort()
            .map((f, index) => ({
              id: index,
              name: `Part ${index + 1}`,
              filename: f,
              url: `/api/download/${jobId}/${f}`,
            }));

          res.json({ segments });
        })
        .run();
    });
  });

  // API: Download Segment
  app.get("/api/download/:jobId/:filename", (req, res) => {
    const { jobId, filename } = req.params;
    const filePath = path.join(OUTPUTS_DIR, jobId, filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).send("File not found");
    }
  });

  // API: Download All as ZIP
  app.get("/api/download-zip/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const outputJobDir = path.join(OUTPUTS_DIR, jobId);

    if (!fs.existsSync(outputJobDir)) {
      return res.status(404).send("Job not found");
    }

    res.attachment(`video_parts_${jobId}.zip`);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);
    archive.directory(outputJobDir, false);
    archive.finalize();
  });

  // Serve static files from outputs for preview
  app.use("/outputs", express.static(OUTPUTS_DIR));
  app.use("/api/outputs", express.static(OUTPUTS_DIR));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Cleanup logic: Delete files older than 1 hour
  setInterval(async () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    const cleanupDir = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const folders = await fs.readdir(dir);
      for (const folder of folders) {
        const folderPath = path.join(dir, folder);
        const stats = await fs.stat(folderPath);
        if (now - stats.mtimeMs > oneHour) {
          await fs.remove(folderPath);
          console.log(`Cleaned up: ${folderPath}`);
        }
      }
    };

    await cleanupDir(UPLOADS_DIR);
    await cleanupDir(OUTPUTS_DIR);
  }, 15 * 60 * 1000); // Check every 15 mins

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

const appPromise = startServer();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
