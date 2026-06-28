import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import api from '../services/api';

const UploadForm: React.FC = () => {
  const [file, setFile] = React.useState<File | null>(null);
  const [gradeLevel, setGradeLevel] = React.useState<string | null>(null);
  const [readingDifficulty, setReadingDifficulty] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setGradeLevel(data.grade_level ?? null);
          setReadingDifficulty(data.reading_difficulty ?? null);
        }
      } catch {}
    };
    fetchProfile();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type === "application/pdf") setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post('/upload-pdf/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate('/learning', { state: { text: response.data.text, grade_level: gradeLevel, reading_difficulty: readingDifficulty } });
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${
          dragOver ? "border-primary bg-primary-fixed/20 scale-[1.01]" : file ? "border-tertiary-fixed-dim bg-tertiary-fixed/10" : "border-outline-variant bg-surface-container-low/50 hover:bg-primary-fixed/10 hover:border-primary/40"
        }`}
      >
        <input ref={inputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
        <span className={`material-symbols-outlined text-6xl mb-4 ${file ? "text-tertiary-fixed-dim" : "text-primary/40"}`}
          style={{fontVariationSettings: "'FILL' 1"}}>{file ? "check_circle" : "cloud_upload"}</span>
        {file ? (
          <>
            <p className="font-heading text-lg font-semibold text-on-surface">{file.name}</p>
            <p className="text-sm text-on-surface-variant font-body mt-1">{(file.size / 1024).toFixed(0)} KB — Click to change</p>
          </>
        ) : (
          <>
            <p className="font-heading text-lg font-semibold text-on-surface">Drop your PDF here</p>
            <p className="text-sm text-on-surface-variant font-body mt-1">or click to browse files</p>
            <p className="text-xs text-outline mt-3 font-body">Max 5 MB, up to 20 pages</p>
          </>
        )}
      </div>

      <button type="submit" disabled={!file || uploading}
        className={`w-full py-3.5 rounded-xl font-heading text-sm font-semibold transition-all active:scale-[0.98] shadow-lg ${
          file && !uploading
            ? "bg-primary-container text-white hover:bg-primary shadow-primary/20"
            : "bg-surface-container text-on-surface-variant cursor-not-allowed shadow-none"
        }`}>
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            Processing...
          </span>
        ) : "Upload & Simplify"}
      </button>
    </form>
  );
};

export default UploadForm;
