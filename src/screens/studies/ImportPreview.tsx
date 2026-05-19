import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import { useStudiesStore } from '../../store/useStudiesStore';
import { calculateGPA } from '../../utils/gpa';
import { ParsedCSVResult } from '../../utils/csvParser';

interface PreviewState extends ParsedCSVResult {}

// Runtime shape check for the value pulled out of sessionStorage. We don't
// trust this blob: a future XSS, a shared device with devtools, or any other
// path that lets an attacker plant arbitrary JSON would otherwise let them
// drive `data.courses` (which gets persisted into Dexie) into prototype-
// pollution territory (`__proto__`, `constructor` keys) or pass unexpected
// types downstream. Reject anything that doesn't match the expected schema.
function isParsedCSVResult(x: unknown): x is ParsedCSVResult {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (!Array.isArray(o.courses) || !Array.isArray(o.errors)) return false;
  for (const c of o.courses) {
    if (!c || typeof c !== 'object') return false;
    const row = c as Record<string, unknown>;
    if (typeof row.name !== 'string') return false;
    if (typeof row.weight !== 'number') return false;
    if (typeof row.grade !== 'number') return false;
  }
  for (const e of o.errors) {
    if (typeof e !== 'string') return false;
  }
  return true;
}

export default function ImportPreview() {
  const navigate = useNavigate();
  const [data, setData] = useState<PreviewState | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmImport = useStudiesStore((s) => s.confirmImport);
  const currentImport = useStudiesStore((s) => s.currentImport);

  useEffect(() => {
    const raw = sessionStorage.getItem('csv.preview');
    if (!raw) {
      navigate('/studies/import');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem('csv.preview');
      navigate('/studies/import');
      return;
    }
    if (!isParsedCSVResult(parsed)) {
      // Treat as tampered — wipe and bounce back to import.
      sessionStorage.removeItem('csv.preview');
      navigate('/studies/import');
      return;
    }
    setData(parsed);
  }, []);

  const previewGpa = useMemo(() => {
    if (!data) return 0;
    return calculateGPA(
      data.courses.map((c, i) => ({
        ...c,
        id: String(i),
        importId: 'preview',
        createdAt: '',
      }))
    );
  }, [data]);

  const onConfirm = async () => {
    if (!data) return;
    setSaving(true);
    await confirmImport(data.courses);
    sessionStorage.removeItem('csv.preview');
    setSaving(false);
    navigate('/studies');
  };

  if (!data) return null;

  return (
    <>
      <AppHeader title="Preview & Confirm" back="/studies/import" backLabel="Import" showAvatar={false} />
      <div className="space-y-3">
        <div className="alert alert-warn">
          <span className="w-2 h-2 rounded-full bg-warning" />
          <span>Confirm replaces all existing grade data</span>
        </div>

        {data.errors.length > 0 && (
          <div className="alert alert-danger">
            <span className="w-2 h-2 rounded-full bg-danger" />
            <span>{data.errors.length} row(s) skipped — {data.errors[0]}</span>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">
              Preview — {Math.min(3, data.courses.length)} of {data.courses.length} rows
            </span>
            <span className="text-[9px] uppercase tracking-wider text-warning border border-warning/40 bg-warning/5 rounded-sm px-1.5 py-0.5">
              Unconfirmed
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted text-left">
                <th className="pb-2 font-medium">Course</th>
                <th className="pb-2 font-medium">Weight</th>
                <th className="pb-2 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.slice(0, 3).map((c, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 truncate max-w-[140px]">{c.name}</td>
                  <td className="py-1.5">{c.weight}%</td>
                  <td className="py-1.5">{c.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card flex items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-primary/60 bg-primary/5 shadow-glow flex items-center justify-center font-heading font-bold text-sm flex-shrink-0">
            {previewGpa.toFixed(2)}
          </div>
          <div>
            <div className="font-heading font-semibold text-xs">
              Calculated GPA · {data.courses.length} courses
            </div>
            <div className="text-[10px] text-text-muted">
              {currentImport
                ? `Replaces current ${currentImport.calculatedGpa.toFixed(2)}`
                : 'No prior import to replace'}
            </div>
          </div>
        </div>

        <button className="btn w-full" onClick={onConfirm} disabled={saving || !data.courses.length}>
          {saving ? 'Importing…' : 'Confirm & Import'}
        </button>
        <button className="btn-ghost w-full" onClick={() => navigate('/studies/import')}>
          Cancel
        </button>
      </div>
    </>
  );
}
