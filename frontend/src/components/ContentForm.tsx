import React from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, FileText, Inbox, Loader2, Send } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface ContentItem {
  id: string;
  text: string;
}

/**
 * Was hardcoded to http://localhost:8000 in three places, had two debug
 * console.log calls, and used raw green-100/red-100 outside the app's token
 * set. Fixed alongside the icon/consistency pass.
 */
const ContentForm: React.FC = () => {
  const [text, setText] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [contentList, setContentList] = React.useState<ContentItem[]>([]);
  const [loadingContent, setLoadingContent] = React.useState(true);
  const [fetchingError, setFetchingError] = React.useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = React.useState<{ text: string; ok: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchContent = async () => {
    setLoadingContent(true);
    setFetchingError(null);
    try {
      const response = await axios.get(`${API_URL}/get-content/`);
      setContentList(response.data.content);
    } catch (error) {
      console.error('Error fetching content:', error);
      setFetchingError('Failed to load content.');
    } finally {
      setLoadingContent(false);
    }
  };

  React.useEffect(() => {
    fetchContent();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionMessage(null);

    if (!text && !file) {
      setSubmissionMessage({ text: 'Please provide text or upload a file.', ok: false });
      return;
    }

    setIsSubmitting(true);
    try {
      if (text) {
        const formData = new FormData();
        formData.append('text', text);
        await axios.post(`${API_URL}/add-content/`, formData);
        setSubmissionMessage({ text: 'Content added successfully.', ok: true });
        setText('');
        await fetchContent();
      }
      if (file) {
        const uploadData = new FormData();
        uploadData.append('file', file);
        const uploadResponse = await axios.post(`${API_URL}/upload-pdf/`, uploadData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const addContentData = new FormData();
        addContentData.append('text', uploadResponse.data.text);
        await axios.post(`${API_URL}/add-content/`, addContentData);

        setSubmissionMessage({ text: 'File content added successfully.', ok: true });
        setFile(null);
        const fileInput = document.getElementById('file') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
        await fetchContent();
      }
    } catch (error) {
      console.error('Error during submission:', error);
      setSubmissionMessage({ text: 'Failed to add content. Please try again.', ok: false });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-slate-700 text-sm font-semibold mb-1.5" htmlFor="text">
          Copy-paste text
        </label>
        <textarea
          className="w-full rounded-control border border-slate-300 py-2 px-3 text-slate-700 leading-relaxed
                     focus:outline-none focus:ring-2 focus:ring-primary-500"
          id="text"
          rows={8}
          placeholder="Paste a passage here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-slate-700 text-sm font-semibold mb-1.5" htmlFor="file">
          Or upload a file
        </label>
        <input
          className="w-full rounded-control border border-slate-300 py-2 px-3 text-slate-700
                     file:mr-3 file:py-1.5 file:px-3 file:rounded-control file:border-0
                     file:bg-primary-50 file:text-primary-700 file:font-medium
                     focus:outline-none focus:ring-2 focus:ring-primary-500"
          id="file"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60
                   text-white font-semibold py-2.5 px-5 rounded-control min-h-[44px]"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="h-4 w-4" aria-hidden="true" />
        )}
        {isSubmitting ? 'Submitting…' : 'Submit'}
      </button>

      {submissionMessage && (
        <div
          role="status"
          className={`flex items-center gap-2 p-3 rounded-control text-sm ${
            submissionMessage.ok
              ? 'bg-success-50 text-success-700 border border-success-100'
              : 'bg-danger-50 text-danger-700 border border-danger-100'
          }`}
        >
          {submissionMessage.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {submissionMessage.text}
        </div>
      )}

      <div className="pt-4 border-t border-slate-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Your content
        </h3>

        {loadingContent && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading…
          </p>
        )}

        {!loadingContent && fetchingError && (
          <p className="flex items-center gap-2 text-sm text-danger-600">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {fetchingError}
          </p>
        )}

        {!loadingContent && !fetchingError && contentList.length === 0 && (
          <div className="text-center py-8">
            <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-slate-500 text-sm">Nothing here yet. Add your first piece above.</p>
          </div>
        )}

        {!loadingContent && !fetchingError && contentList.length > 0 && (
          <ul className="space-y-2">
            {contentList.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-control border border-slate-200 bg-slate-50 text-sm text-slate-700"
              >
                <FileText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="flex-1">
                  {item.text.slice(0, 140)}
                  {item.text.length > 140 ? '…' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
};

export default ContentForm;
