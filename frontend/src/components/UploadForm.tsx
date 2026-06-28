
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
  const [user] = useAuthState(auth);
  const navigate = useNavigate();

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
      } catch {
        // profile fields missing — defaults will apply downstream
      }
    };
    fetchProfile();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const response = await api.post('/upload-pdf/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        navigate('/learning', {
          state: {
            text: response.data.text,
            grade_level: gradeLevel,
            reading_difficulty: readingDifficulty,
          },
        });
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="file">
          PDF File
        </label>
        <input
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          id="file"
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
        />
      </div>
      <div className="flex items-center justify-between">
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          type="submit"
        >
          Upload
        </button>
      </div>
    </form>
  );
};

export default UploadForm;
