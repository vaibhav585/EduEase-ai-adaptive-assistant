
import React from 'react';
import api from '../services/api';

interface ContentItem {
  id: string;
  text: string;
}

const ContentForm: React.FC = () => {
  const [text, setText] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [contentList, setContentList] = React.useState<ContentItem[]>([]); // New state for content list
  const [loadingContent, setLoadingContent] = React.useState(true); // New loading state for fetching content
  const [fetchingError, setFetchingError] = React.useState<string | null>(null); // New error state for fetching content
  const [submissionMessage, setSubmissionMessage] = React.useState<string | null>(null); // For success/error messages after submission
  const [isSubmitting, setIsSubmitting] = React.useState(false); // For loading indicator during submission

  const fetchContent = async () => {
    setLoadingContent(true);
    setFetchingError(null);
    try {
      const response = await api.get('/get-content/');
      setContentList(response.data.content);
    } catch (error) {
      console.error('Error fetching content:', error);
      setFetchingError('Failed to load content.');
    } finally {
      setLoadingContent(false);
    }
  };

  React.useEffect(() => {
    fetchContent(); // Fetch content on component mount
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionMessage(null);
    setIsSubmitting(true);

    try {
      if (text) {
        const formData = new FormData();
        formData.append('text', text);
        const response = await api.post('/add-content/', formData);
        console.log('Content added:', response.data);
        setSubmissionMessage('Content added successfully!');
        setText(''); // Clear text field
        fetchContent(); // Refresh content list
      }
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadResponse = await api.post('/upload-pdf/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        const addContentFormData = new FormData();
        addContentFormData.append('text', uploadResponse.data.text);
        const addContentResponse = await api.post('/add-content/', addContentFormData);
        console.log('Content added:', addContentResponse.data);
        setSubmissionMessage('File content added successfully!');
        setFile(null); // Clear file input
        // Reset file input element value
        const fileInput = document.getElementById('file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        fetchContent(); // Refresh content list
      }
      if (!text && !file) {
        setSubmissionMessage('Please provide text or upload a file.');
      }
    } catch (error) {
      console.error('Error during submission:', error);
      setSubmissionMessage('Failed to add content. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="text">
          Copy-paste text
        </label>
        <textarea
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          id="text"
          rows={10}
          placeholder="Enter text here"
          value={text}
          onChange={handleTextChange}
        />
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="file">
          Or upload a file
        </label>
        <input
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          id="file"
          type="file"
          onChange={handleFileChange}
        />
      </div>
      <div className="flex items-center justify-between">
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>

      {submissionMessage && (
        <div className={`mt-4 p-3 rounded ${submissionMessage.includes('successfully') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {submissionMessage}
        </div>
      )}

      <h3 className="text-xl font-bold mt-8 mb-4">Existing Content</h3>
      {loadingContent ? (
        <div>Loading existing content...</div>
      ) : fetchingError ? (
        <div className="text-red-500">{fetchingError}</div>
      ) : contentList.length === 0 ? (
        <div>No content added yet.</div>
      ) : (
        <ul>
          {contentList.map(item => (
            <li key={item.id} className="mb-2 p-2 border rounded bg-gray-50">
              {item.text.substring(0, 100)}... (ID: {item.id})
            </li>
          ))}
        </ul>
      )}
    </form>
  );
};

export default ContentForm;
