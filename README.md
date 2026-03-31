# Video Splitter Pro

Professional video splitting tool. Split long videos into segments by duration or equal parts instantly.

## 🚀 Local Setup Instructions

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **FFmpeg** installed on your system.

### 2. Install FFmpeg
- **macOS (Homebrew):** `brew install ffmpeg`
- **Ubuntu/Debian:** `sudo apt update && sudo apt install ffmpeg`
- **Windows (Chocolatey):** `choco install ffmpeg`
- **Windows (Manual):** Download from [ffmpeg.org](https://ffmpeg.org/download.html), extract, and add the `bin` folder to your System Environment Variables.

### 3. Troubleshooting: "Scripts are disabled on this system" (Windows)
If you see an error like `npm.ps1 cannot be loaded because running scripts is disabled`, run this command in your PowerShell as **Administrator**:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Type `Y` and press Enter when prompted.

### 4. Run the App
1. Open your terminal in the project root.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser to `http://localhost:3000`.

## 📁 Project Structure
- `server.ts`: Node.js Express server with FFmpeg integration.
- `src/App.tsx`: React frontend with chunked upload support.
- `uploads/`: Temporary storage for uploads.
- `outputs/`: Storage for processed segments.

## 🔐 Security
- Files are automatically deleted after 1 hour.
- Chunked uploads bypass proxy size limits (413 errors).
