import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import ListRow from '../../components/ListRow';
import { parseStudyDeskCSV } from '../../utils/csvParser';

const SAMPLE_CSV = `course,weight,grade,semester
Mathematics,30,95,Spring 2026
Data Structures,25,87,Spring 2026
Linear Algebra,25,91,Spring 2026
Software Eng.,20,82,Spring 2026`;

export default function CSVImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = (text: string) => {
    setError(null);
    const result = parseStudyDeskCSV(text);
    if (result.errors.length && !result.courses.length) {
      setError(result.errors[0]);
      return;
    }
    sessionStorage.setItem('csv.preview', JSON.stringify(result));
    navigate('/studies/import/preview');
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    handleParse(text);
  };

  const onPasteSubmit = () => {
    if (!paste.trim()) return;
    handleParse(paste);
  };

  return (
    <>
      <AppHeader title="Import Data" back="/studies" backLabel="Studies" showAvatar={false} />
      <div className="space-y-3">
        <div className="alert alert-warn">
          <span className="w-2 h-2 rounded-full bg-warning" />
          <span>Export CSV from StudyDesk → upload here</span>
        </div>

        <div className="border-2 border-dashed border-border rounded-md bg-surface p-6 text-center space-y-3">
          <div className="text-3xl">📄</div>
          <div>
            <div className="font-heading font-semibold text-sm">Upload StudyDesk CSV</div>
            <div className="text-[10px] text-text-muted mt-1">
              Tap to choose a file
              <br />
              or paste CSV text below
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <button className="btn w-full" onClick={() => fileInputRef.current?.click()}>
            Choose File
          </button>
          <button
            className="btn-ghost w-full"
            onClick={() => setShowPaste((v) => !v)}
          >
            {showPaste ? 'Hide Paste' : 'Paste CSV Text'}
          </button>
          {showPaste && (
            <div className="space-y-2 text-left">
              <textarea
                className="input min-h-[120px] font-mono text-[11px]"
                placeholder={SAMPLE_CSV}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button className="btn w-full" onClick={onPasteSubmit}>
                Parse Pasted CSV
              </button>
              <button
                className="text-xs text-primary underline"
                onClick={() => setPaste(SAMPLE_CSV)}
              >
                Insert sample
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="alert alert-danger">
            <span className="w-2 h-2 rounded-full bg-danger" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <div className="sec mb-2">Steps</div>
          <div className="card">
            <ListRow label="1. Open StudyDesk app" />
            <ListRow label="2. Grades → Export → CSV" />
            <ListRow label="3. Share / Save to Files" />
            <ListRow label="4. Upload above ↑" />
          </div>
        </div>
      </div>
    </>
  );
}
