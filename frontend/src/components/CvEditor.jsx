import React, { useState, useEffect } from 'react';
import { Save, FileCode, CheckCircle2 } from 'lucide-react';

export default function CvEditor() {
  const [activeSubTab, setActiveSubTab] = useState('cv'); // 'cv' or 'profile'
  const [cvContent, setCvContent] = useState('');
  const [profileContent, setProfileContent] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/cv')
      .then((r) => r.json())
      .then((d) => setCvContent(d.content || ''));

    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => setProfileContent(d.content || ''));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus('Saving...');
    try {
      if (activeSubTab === 'cv') {
        await fetch('/api/cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: cvContent }),
        });
        setStatus('✅ Master CV saved to repository!');
      } else {
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: profileContent }),
        });
        setStatus('✅ Profile YAML saved to repository!');
      }
    } catch (err) {
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 4000);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 backdrop-blur space-y-4">
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('cv')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSubTab === 'cv'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Master CV (cv.md)
          </button>
          <button
            onClick={() => setActiveSubTab('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSubTab === 'profile'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Profile (config/profile.yml)
          </button>
        </div>

        <div className="flex items-center gap-3">
          {status && <span className="text-xs font-mono text-indigo-300">{status}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save File'}</span>
          </button>
        </div>
      </div>

      <div>
        {activeSubTab === 'cv' ? (
          <textarea
            rows={22}
            value={cvContent}
            onChange={(e) => setCvContent(e.target.value)}
            className="w-full bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
            placeholder="Edit your Master CV in Markdown..."
          />
        ) : (
          <textarea
            rows={22}
            value={profileContent}
            onChange={(e) => setProfileContent(e.target.value)}
            className="w-full bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
            placeholder="Edit your profile YAML configuration..."
          />
        )}
      </div>
    </div>
  );
}
