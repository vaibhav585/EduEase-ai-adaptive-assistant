
import React from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const UploadForm: React.FC = () => {
  const [file, setFile] = React.useState<File | null>(null);
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    console.log('handleSubmit called'); // Added for debugging
    e.preventDefault();
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const response = await axios.post('http://localhost:8000/upload-pdf/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        navigate('/learning', { state: { text: response.data.text } });
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    } else {
      console.warn('No file selected for upload.'); // Added for debugging
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
