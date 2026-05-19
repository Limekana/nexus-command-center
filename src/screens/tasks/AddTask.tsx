import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import TemplateChips from '../../components/TemplateChips';
import { useTaskStore } from '../../store/useTaskStore';
import { useTemplatesStore } from '../../store/useTemplatesStore';
import type { TaskTemplate } from '../../types/templates';
import { TaskCategory, TaskPriority } from '../../types/tasks';

const priorities: { key: TaskPriority; label: string }[] = [
  { key: 'high', label: '🔴 High' },
  { key: 'medium', label: '🟡 Medium' },
  { key: 'low', label: '🟢 Low' },
];

const categories: { key: TaskCategory; label: string }[] = [
  { key: 'study', label: '📚 Study' },
  { key: 'personal', label: '🏠 Personal' },
  { key: 'finance', label: '💰 Finance' },
  { key: 'work', label: '💼 Work' },
];

export default function AddTask() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');

  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const templates = useTemplatesStore((s) => s.tasks);
  const refreshTemplates = useTemplatesStore((s) => s.refresh);

  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('personal');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    const t = tasks.find((x) => x.id === editId);
    if (!t) return;
    setTitle(t.title);
    setDue(t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 16) : '');
    setPriority(t.priority);
    setCategory(t.category ?? 'personal');
    setNotes(t.notes ?? '');
  }, [editId, tasks]);

  useEffect(() => {
    void refreshTemplates();
  }, []);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const payload = {
      title: title.trim(),
      dueDate: due ? new Date(due).toISOString() : undefined,
      priority,
      category,
      notes: notes.trim() || undefined,
    };
    if (editId) {
      await updateTask(editId, payload);
    } else {
      await addTask(payload);
    }
    setSaving(false);
    navigate('/tasks');
  };

  const onDelete = async () => {
    if (!editId) return;
    if (!confirm('Delete this task?')) return;
    await deleteTask(editId);
    navigate('/tasks');
  };

  const showTemplates = !editId && templates.length > 0;

  const applyTemplate = (t: TaskTemplate) => {
    setTitle(t.title);
    setPriority(t.priority);
    if (t.category) setCategory(t.category);
    // Due date intentionally not pre-filled — recurring tasks land on
    // different dates each time, so we leave it for the user to set.
  };

  return (
    <>
      <AppHeader
        title={editId ? 'Edit Task' : 'New Task'}
        back="/tasks"
        backLabel="Tasks"
        showAvatar={false}
      />
      <div className="space-y-3">
        {showTemplates && (
          <TemplateChips
            templates={templates}
            onPick={applyTemplate}
            label={(t) => <span className="truncate max-w-[180px]">{t.title}</span>}
          />
        )}
        <div>
          <div className="sec mb-2">Task Name</div>
          <input
            className="input"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <div className="sec mb-2">Due Date & Time</div>
          <input
            className="input"
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>

        <div>
          <div className="sec mb-2">Priority</div>
          <div className="flex gap-2 flex-wrap">
            {priorities.map((p) => (
              <button
                key={p.key}
                onClick={() => setPriority(p.key)}
                className={`chip ${priority === p.key ? 'chip-on' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="sec mb-2">Category</div>
          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`chip ${category === c.key ? 'chip-on' : ''}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="sec mb-2">Notes</div>
          <textarea
            className="input min-h-[80px]"
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button className="btn w-full" onClick={submit} disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : editId ? 'Save Changes' : 'Save Task'}
        </button>
        {editId && (
          <button className="btn-ghost w-full text-danger border-danger/40" onClick={onDelete}>
            Delete Task
          </button>
        )}
        <div className="text-[10px] text-text-muted text-center">
          Queued locally · syncs when online
        </div>
      </div>
    </>
  );
}
