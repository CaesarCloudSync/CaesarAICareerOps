import React, { useState, useEffect } from 'react';
import {
  Save,
  ShieldCheck,
  MapPin,
  Briefcase,
  User,
  Plus,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

export default function DiscoverySettingsView() {
  const [activeTab, setActiveTab] = useState('geofence'); // 'geofence' | 'profile' | 'cv'

  // Discovery settings state
  const [discovery, setDiscovery] = useState({
    uk_only: true,
    country: 'United Kingdom',
    always_allow_locations: ['London', 'Greater London', 'United Kingdom', 'UK', 'Great Britain', 'England'],
    allowed_locations: ['London', 'Greater London', 'United Kingdom', 'UK', 'England', 'Remote - UK', 'UK - Remote'],
    blocked_locations: ['China', 'Beijing', 'Shanghai', 'Shenzhen', 'Hangzhou', 'United States', 'USA', 'India'],
    target_roles: ['Project Manager', 'Delivery Specialist', 'Project Coordinator', 'Technical Project Manager'],
    negative_keywords: ['Intern', 'Graduate', 'Student', 'Junior'],
    reject_cjk: true,
  });

  // Profile data state
  const [profile, setProfile] = useState({
    full_name: 'Bob Hillus',
    title: 'Project and Delivery Specialist',
    email: 'bob.hillus@gmail.com',
    phone: '07718 256800',
    location: 'Enfield, Greater London, EN1 1XW',
    country: 'United Kingdom',
    city: 'Enfield, Greater London',
    headline: 'Project & Delivery Specialist with corporate, engineering, and healthcare experience',
    exit_story: 'Proven track record delivering engineering workstreams for fusion energy programmes and managing cross-functional operations.',
    superpowers: [
      'Research and planning',
      'Customer service & stakeholder management',
      'Effective communication & organizational skills',
      'Time management & budgeting',
    ],
    target_roles: ['Project Manager', 'Delivery Specialist', 'Project Coordinator'],
    salary_target: '£40K-£60K',
    salary_min: '£35K',
    visa_status: 'No sponsorship needed',
  });

  // Master CV state
  const [cvContent, setCvContent] = useState('');

  // Status message
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [inputTags, setInputTags] = useState({
    always_allow: '',
    allow: '',
    block: '',
    roles: '',
    profile_roles: '',
    superpower: '',
  });

  useEffect(() => {
    // Load discovery settings
    fetch('/api/settings/discovery')
      .then((r) => r.json())
      .then((d) => setDiscovery((prev) => ({ ...prev, ...d })))
      .catch((err) => console.error('Error fetching discovery settings', err));

    // Load profile structured settings
    fetch('/api/settings/profile')
      .then((r) => r.json())
      .then((d) => setProfile((prev) => ({ ...prev, ...d })))
      .catch((err) => console.error('Error fetching profile settings', err));

    // Load CV markdown
    fetch('/api/cv')
      .then((r) => r.json())
      .then((d) => setCvContent(d.content || ''))
      .catch((err) => console.error('Error fetching CV', err));
  }, []);

  const handleSaveDiscovery = async () => {
    setSaving(true);
    setStatusMessage('Saving discovery settings...');
    try {
      const res = await fetch('/api/settings/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discovery),
      });
      if (res.ok) {
        setStatusMessage('✅ UK Geo-fence & Discovery rules updated safely without YAML errors!');
      } else {
        setStatusMessage('❌ Failed to save discovery settings.');
      }
    } catch (err) {
      setStatusMessage(`❌ Error: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(''), 4000);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setStatusMessage('Saving profile...');
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setStatusMessage('✅ Candidate profile saved cleanly to database & configuration!');
      } else {
        setStatusMessage('❌ Failed to save profile.');
      }
    } catch (err) {
      setStatusMessage(`❌ Error: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(''), 4000);
    }
  };

  const handleSaveCv = async () => {
    setSaving(true);
    setStatusMessage('Saving Master CV...');
    try {
      const res = await fetch('/api/cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cvContent }),
      });
      if (res.ok) {
        setStatusMessage('✅ Master CV saved to database repository!');
      } else {
        setStatusMessage('❌ Failed to save CV.');
      }
    } catch (err) {
      setStatusMessage(`❌ Error: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(''), 4000);
    }
  };

  const removeTag = (field, index) => {
    setDiscovery((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const addTag = (field, inputKey) => {
    const val = inputTags[inputKey]?.trim();
    if (!val) return;
    if (!discovery[field].includes(val)) {
      setDiscovery((prev) => ({
        ...prev,
        [field]: [...prev[field], val],
      }));
    }
    setInputTags((prev) => ({ ...prev, [inputKey]: '' }));
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 backdrop-blur space-y-5">
      {/* Tab navigation */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('geofence')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === 'geofence'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>🇬🇧 UK Pigeonhole & Geo-Fence</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Candidate Profile (Form)</span>
          </button>

          <button
            onClick={() => setActiveTab('cv')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === 'cv'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Master CV (Markdown)</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {statusMessage && (
            <span className="text-xs text-indigo-300 font-mono flex items-center gap-1">
              {statusMessage}
            </span>
          )}
          <button
            onClick={
              activeTab === 'geofence'
                ? handleSaveDiscovery
                : activeTab === 'profile'
                ? handleSaveProfile
                : handleSaveCv
            }
            disabled={saving}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* TAB 1: UK Pigeonhole & Geo-fence */}
      {activeTab === 'geofence' && (
        <div className="space-y-5">
          <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Strict UK Pigeonholing</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Fails closed: Any posting missing a location or outside your permitted UK regions will be discarded.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={discovery.uk_only}
                  onChange={(e) => setDiscovery((p) => ({ ...p, uk_only: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Always Allow (London, UK, England, Great Britain) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span>Always Allow Locations (Bypasses Blocks)</span>
              </label>
              <span className="text-[11px] text-slate-500">London, UK, England, Great Britain</span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg min-h-[46px]">
              {discovery.always_allow_locations.map((loc, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                >
                  <span>{loc}</span>
                  <button
                    onClick={() => removeTag('always_allow_locations', idx)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={inputTags.always_allow}
                  onChange={(e) => setInputTags((p) => ({ ...p, always_allow: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('always_allow_locations', 'always_allow')}
                  placeholder="+ Add always allow..."
                  className="px-2 py-0.5 bg-transparent text-xs text-slate-200 focus:outline-none w-36"
                />
                <button
                  onClick={() => addTag('always_allow_locations', 'always_allow')}
                  className="text-slate-400 hover:text-indigo-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Hard Blocked Regions (China, Beijing, Shanghai, etc.) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <X className="w-3.5 h-3.5 text-rose-400" />
                <span>Hard Blocked Regions & Foreign Hubs</span>
              </label>
              <span className="text-[11px] text-slate-500">China, Beijing, Shanghai, USA, etc.</span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg min-h-[46px]">
              {discovery.blocked_locations.map((loc, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30"
                >
                  <span>{loc}</span>
                  <button
                    onClick={() => removeTag('blocked_locations', idx)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={inputTags.block}
                  onChange={(e) => setInputTags((p) => ({ ...p, block: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('blocked_locations', 'block')}
                  placeholder="+ Add blocked region..."
                  className="px-2 py-0.5 bg-transparent text-xs text-slate-200 focus:outline-none w-36"
                />
                <button
                  onClick={() => addTag('blocked_locations', 'block')}
                  className="text-slate-400 hover:text-rose-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Target Roles Filter */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
              <span>Target Role Titles (Candidate CV Matching)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg min-h-[46px]">
              {discovery.target_roles.map((role, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
                >
                  <span>{role}</span>
                  <button
                    onClick={() => removeTag('target_roles', idx)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={inputTags.roles}
                  onChange={(e) => setInputTags((p) => ({ ...p, roles: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('target_roles', 'roles')}
                  placeholder="+ Add target role..."
                  className="px-2 py-0.5 bg-transparent text-xs text-slate-200 focus:outline-none w-36"
                />
                <button
                  onClick={() => addTag('target_roles', 'roles')}
                  className="text-slate-400 hover:text-indigo-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Candidate Profile Form */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Full Name</label>
            <input
              type="text"
              value={profile.full_name}
              onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Professional Title</label>
            <input
              type="text"
              value={profile.title}
              onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Email Address</label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Phone</label>
            <input
              type="text"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Location (London / UK)</label>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Visa / Work Authorization</label>
            <input
              type="text"
              value={profile.visa_status}
              onChange={(e) => setProfile((p) => ({ ...p, visa_status: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-slate-300">Narrative Headline</label>
            <input
              type="text"
              value={profile.headline}
              onChange={(e) => setProfile((p) => ({ ...p, headline: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-slate-300">Exit Story / Career Summary</label>
            <textarea
              rows={3}
              value={profile.exit_story}
              onChange={(e) => setProfile((p) => ({ ...p, exit_story: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Target Salary Range</label>
            <input
              type="text"
              value={profile.salary_target}
              onChange={(e) => setProfile((p) => ({ ...p, salary_target: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Minimum Annual Compensation</label>
            <input
              type="text"
              value={profile.salary_min}
              onChange={(e) => setProfile((p) => ({ ...p, salary_min: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}

      {/* TAB 3: Master CV Markdown */}
      {activeTab === 'cv' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-300">Master CV Markdown (cv.md)</label>
            <span className="text-[11px] text-slate-500">Edit markdown content directly</span>
          </div>
          <textarea
            rows={18}
            value={cvContent}
            onChange={(e) => setCvContent(e.target.value)}
            className="w-full p-4 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
