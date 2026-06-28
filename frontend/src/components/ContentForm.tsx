import React from 'react';
import api from '../services/api';

interface ContentItem {
  id: string;
  text: string;
}

const ContentForm: React.FC = () => {
  const [text, setText] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [contentList, setContentList] = React.useState<ContentItem[]>([]);
  const [loadingContent, setLoadingContent] = React.useState(true);
  const [fetchingError, setFetchingError] = React.useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

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

  React.useEffect(() => { fetchContent(); }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setText(e.target.value); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setFile(e.target.files[0]); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionMessage(null);
    setIsSubmitting(true);
    try {
      if (text) {
        const formData = new FormData();
        formData.append('text', text);
        await api.post('/add-content/', formData);
        setSubmissionMessage('Content added successfully!');
        setText('');
        fetchContent();
      }
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadResponse = await api.post('/upload-pdf/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        const addFormData = new FormData();
        addFormData.append('text', uploadResponse.data.text);
        await api.post('/add-content/', addFormData);
        setSubmissionMessage('File content added successfully!');
        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
        fetchContent();
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
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Text input panel */}
        <div className="glass-card rounded-3xl p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary">edit_note</span>
            <h3 className="font-heading text-lg font-semibold text-on-surface">Paste Text Content</h3>
          </div>
          <textarea
            className="w-full bg-surface-container-low border border-outline-variant rounded-2xl p-4 text-on-surface font-body text-sm leading-relaxed resize-none focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40"
            rows={8}
            placeholder="Paste your learning material here... The AI will simplify and process it for your students."
            value={text}
            onChange={handleTextChange}
          />
        </div>

        {/* File upload panel */}
        <div className="glass-card rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary">upload_file</span>
            <h3 className="font-heading text-lg font-semibold text-on-surface">Or Upload a PDF</h3>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
              file ? "border-tertiary-fixed-dim bg-tertiary-fixed/10" : "border-outline-variant/50 bg-surface-container-low/30 hover:border-primary/40 hover:bg-primary-fixed/10"
            }`}
          >
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
            <span className={`material-symbols-outlined text-4xl mb-2 ${file ? "text-tertiary-fixed-dim" : "text-primary/30"}`}
              style={{fontVariationSettings: "'FILL' 1"}}>{file ? "check_circle" : "cloud_upload"}</span>
            <p className="font-heading text-sm font-semibold text-on-surface">{file ? file.name : "Drop PDF here or click to browse"}</p>
            {file && <p className="text-xs text-on-surface-variant font-body mt-1">{(file.size / 1024).toFixed(0)} KB</p>}
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={isSubmitting}
          className={`w-full py-3.5 rounded-xl font-heading text-sm font-semibold transition-all active:scale-[0.98] shadow-lg ${
            isSubmitting ? "bg-surface-container text-on-surface-variant cursor-not-allowed shadow-none" : "bg-primary-container text-white hover:bg-primary shadow-primary/20"
          }`}>
          {isSubmitting ? "Processing..." : "Add to Library"}
        </button>

        {submissionMessage && (
          <div className={`p-4 rounded-2xl text-sm font-body ${
            submissionMessage.includes('successfully') ? 'bg-tertiary-fixed/20 text-on-tertiary-fixed-variant' : 'bg-error-container text-on-error-container'
          }`}>
            {submissionMessage}
          </div>
        )}
      </form>

      {/* Existing Content */}
      <div className="glass-card rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-primary">library_books</span>
          <h3 className="font-heading text-lg font-semibold text-on-surface">Your Content Library</h3>
          {!loadingContent && <span className="ml-auto font-heading text-xs font-bold text-primary">{contentList.length} items</span>}
        </div>

        {loadingContent ? (
          <p className="text-on-surface-variant text-center py-6 font-body">Loading content...</p>
        ) : fetchingError ? (
          <div className="p-4 rounded-2xl bg-error-container text-on-error-container text-sm font-body">{fetchingError}</div>
        ) : contentList.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-4xl text-primary/15 block mb-2" style={{fontVariationSettings: "'FILL' 1"}}>folder_open</span>
            <p className="text-sm text-on-surface-variant font-body">No content added yet. Upload a PDF or paste text above.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {contentList.map(item => (
              <div key={item.id} className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all group">
                <p className="text-sm text-on-surface font-body leading-relaxed">{item.text.substring(0, 150)}...</p>
                <p className="text-[10px] text-on-surface-variant font-heading mt-2 uppercase tracking-wider">ID: {item.id.substring(0, 12)}...</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentForm;
