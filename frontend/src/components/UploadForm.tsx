import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FileUp, Loader2, UploadCloud, XCircle } from 'lucide-react';

import { useProfile } from '../hooks/useProfile';
import { notify } from '../services/notify';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — generous for a text-based lesson PDF

/**
 * Was hardcoded to http://localhost:8000 (broken outside local dev), had two
 * debug console.log/warn calls left in, never sent describeImages, and gave no
 * visual feedback during upload beyond a spinner-less blocking wait. Rewritten
 * with a proper dropzone, upload progress, and error handling via notify()
 * rather than a silent console.error.
 */
const UploadForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { profile } = useProfile();

  const pickFile = (candidate: File | undefined) => {
    setError('');
    if (!candidate) return;
    if (candidate.type !== 'application/pdf') {
      setError('Please choose a PDF file.');
      return;
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      setError('That file is larger than 25MB. Try a smaller PDF.');
      return;
    }
    setFile(candidate);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setProgress(0);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('describeImages', String(profile.prefs.describeImages));

    try {
      const response = await axios.post(`${API_URL}/api/upload-pdf/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      navigate('/learning', {
        state: { text: response.data.text, images: response.data.images ?? [] },
      });
    } catch (err) {
      console.error('Error uploading file:', err);
      const detail =
        axios.isAxiosError(err) && typeof err.response?.data?.detail === 'string'
          ? err.response.data.detail
          : 'Could not process that PDF. Please try again.';
      setError(detail);
      notify(detail, { kind: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5">
      <label htmlFor="pdf-file" className="sr-only">
        PDF file
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Choose or drop a PDF file"
        className={`rounded-control border-2 border-dashed p-8 text-center cursor-pointer transition min-h-[160px]
          flex flex-col items-center justify-center gap-2
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2
          ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'}`}
      >
        <input
          ref={inputRef}
          id="pdf-file"
          type="file"
          accept="application/pdf"
          onChange={(e) => pickFile(e.target.files?.[0])}
          className="sr-only"
        />

        {file ? (
          <>
            <FileUp className="h-8 w-8 text-primary-600" aria-hidden="true" />
            <p className="font-medium text-slate-800 break-all">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-danger-600 min-h-[36px] px-2"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Choose a different file
            </button>
          </>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-slate-400" aria-hidden="true" />
            <p className="font-medium text-slate-700">Drop a PDF here, or click to browse</p>
            <p className="text-xs text-slate-500">PDF only, up to 25MB</p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-danger-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || uploading}
        className="mt-5 w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700
                   disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold
                   py-3 rounded-control min-h-[44px] transition"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Uploading{progress > 0 ? ` — ${progress}%` : '…'}
          </>
        ) : (
          <>
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            Upload and simplify
          </>
        )}
      </button>
    </form>
  );
};

export default UploadForm;
