/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Scissors, 
  Download, 
  FileVideo, 
  X, 
  CheckCircle2, 
  Loader2, 
  ChevronRight, 
  Clock, 
  Layers,
  AlertCircle,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Segment {
  id: number;
  name: string;
  filename: string;
  url: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobData, setJobData] = useState<{ jobId: string; duration: number; filename: string } | null>(null);
  const [splitType, setSplitType] = useState<'duration' | 'parts'>('duration');
  const [splitValue, setSplitValue] = useState<string>('60');
  const [processing, setProcessing] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 500 * 1024 * 1024) {
        setError("File size exceeds 500MB limit.");
        return;
      }
      setFile(selectedFile);
      setError(null);
      setJobData(null);
      setSegments([]);
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const jobId = Math.random().toString(36).substring(7);

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('jobId', jobId);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('filename', file.name);

        const response = await axios.post('/api/upload-chunk', formData, {
          onUploadProgress: (progressEvent) => {
            const chunkProgress = (progressEvent.loaded / (progressEvent.total || 1));
            const totalProgress = Math.round(((i + chunkProgress) / totalChunks) * 100);
            setUploadProgress(totalProgress);
          },
        });

        if (response.data.status === 'complete') {
          setJobData(response.data);
        }
      }
    } catch (err: any) {
      console.error("Upload error details:", err);
      if (err.response) {
        const serverError = err.response.data?.error;
        const serverDetails = err.response.data?.details;
        setError(`${serverError || "Server Error"}: ${serverDetails || "No details provided"}`);
      } else if (err.request) {
        setError("Network error: The server might be blocking large requests. Trying chunked upload...");
      } else {
        setError(`Error: ${err.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSplit = async () => {
    if (!jobData) return;
    setProcessing(true);
    setError(null);

    try {
      const response = await axios.post('/api/split', {
        jobId: jobData.jobId,
        filename: jobData.filename,
        splitType,
        value: splitValue,
      });
      setSegments(response.data.segments);
    } catch (err: any) {
      setError(err.response?.data?.error || "Splitting failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const estimatedParts = jobData ? (
    splitType === 'duration' 
      ? Math.ceil(jobData.duration / parseFloat(splitValue || '1'))
      : parseInt(splitValue || '1')
  ) : 0;

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Scissors className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">VideoSplitter<span className="text-indigo-600">Pro</span></span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">How it works</a>
            <a href="#" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">Pricing</a>
            <button className="btn-primary py-2 text-sm">Get Started</button>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-4xl mx-auto w-full px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight"
          >
            Split Your Videos Instantly
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-600 max-w-2xl mx-auto"
          >
            No editing skills needed. Professional-grade video splitting directly in your browser.
          </motion.p>
        </div>

        <div className="space-y-8">
          {/* Step 1: Upload */}
          <section className="glass-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">1</div>
              <h2 className="text-xl font-bold">Upload Video</h2>
            </div>

            {!jobData ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
                  file ? "border-indigo-400 bg-indigo-50/30" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
                )}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept="video/*"
                />
                {file ? (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-4">
                      <FileVideo className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-semibold text-slate-900 mb-1">{file.name}</p>
                    <p className="text-sm text-slate-500 mb-6">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    
                    {!uploading ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); uploadFile(); }}
                        className="btn-primary"
                      >
                        Upload & Continue
                      </button>
                    ) : (
                      <div className="w-full max-w-xs">
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                          <motion.div 
                            className="h-full bg-indigo-600"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Uploading... {uploadProgress}%</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                      <Upload className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-semibold text-slate-900 mb-1">Click to upload or drag and drop</p>
                    <p className="text-sm text-slate-500">MP4, MOV, or AVI (Max 500MB)</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <div>
                    <p className="font-semibold text-emerald-900">{jobData.filename}</p>
                    <p className="text-sm text-emerald-700">Duration: {formatDuration(jobData.duration)}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setJobData(null); setFile(null); setSegments([]); }}
                  className="p-2 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </section>

          {/* Step 2: Split Options */}
          <AnimatePresence>
            {jobData && segments.length === 0 && (
              <motion.section 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-card p-8 overflow-hidden"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">2</div>
                  <h2 className="text-xl font-bold">Split Options</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div 
                    onClick={() => setSplitType('duration')}
                    className={cn(
                      "p-6 rounded-2xl border-2 cursor-pointer transition-all",
                      splitType === 'duration' ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className={cn("w-5 h-5", splitType === 'duration' ? "text-indigo-600" : "text-slate-400")} />
                      <span className="font-bold">By Duration</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">Split video every X seconds.</p>
                    {splitType === 'duration' && (
                      <div className="relative">
                        <input 
                          type="number" 
                          value={splitValue}
                          onChange={(e) => setSplitValue(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Seconds"
                        />
                        <span className="absolute right-3 top-2 text-sm text-slate-400">sec</span>
                      </div>
                    )}
                  </div>

                  <div 
                    onClick={() => setSplitType('parts')}
                    className={cn(
                      "p-6 rounded-2xl border-2 cursor-pointer transition-all",
                      splitType === 'parts' ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <Layers className={cn("w-5 h-5", splitType === 'parts' ? "text-indigo-600" : "text-slate-400")} />
                      <span className="font-bold">Equal Parts</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">Split into X equal segments.</p>
                    {splitType === 'parts' && (
                      <div className="relative">
                        <input 
                          type="number" 
                          value={splitValue}
                          onChange={(e) => setSplitValue(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Number of parts"
                        />
                        <span className="absolute right-3 top-2 text-sm text-slate-400">parts</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-center sm:text-left">
                    <p className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1">Estimated Output</p>
                    <p className="text-2xl font-black text-slate-900">{estimatedParts} <span className="text-slate-400 font-medium text-lg">segments</span></p>
                  </div>
                  <button 
                    onClick={handleSplit}
                    disabled={processing || !splitValue}
                    className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Scissors className="w-5 h-5" />
                        Start Splitting
                      </>
                    )}
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Step 3: Results */}
          <AnimatePresence>
            {segments.length > 0 && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">3</div>
                    <h2 className="text-xl font-bold">Download Segments</h2>
                  </div>
                  <a 
                    href={`/api/download-zip/${jobData?.jobId}`}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download All (ZIP)
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {segments.map((segment) => (
                    <motion.div 
                      key={segment.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: segment.id * 0.05 }}
                      className="glass-card overflow-hidden group"
                    >
                      <div className="aspect-video bg-slate-900 relative">
                        <video 
                          src={`/outputs/${jobData?.jobId}/${segment.filename}`} 
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                          <button 
                            onClick={(e) => {
                              const v = e.currentTarget.parentElement?.previousElementSibling as HTMLVideoElement;
                              v.paused ? v.play() : v.pause();
                            }}
                            className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-xl"
                          >
                            <Play className="w-6 h-6 fill-current" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900">{segment.name}</p>
                          <p className="text-xs text-slate-500 uppercase tracking-tighter">{segment.filename}</p>
                        </div>
                        <a 
                          href={segment.url}
                          className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
                          title="Download this part"
                        >
                          <Download className="w-5 h-5" />
                        </a>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="text-center pt-8">
                  <button 
                    onClick={() => { setJobData(null); setFile(null); setSegments([]); }}
                    className="text-indigo-600 font-semibold hover:underline flex items-center gap-2 mx-auto"
                  >
                    Split another video
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">© 2026 VideoSplitter Pro. v1.0.2. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
