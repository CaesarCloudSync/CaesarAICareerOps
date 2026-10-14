import React, { useState, useEffect } from 'react';
import { KeyRound, Terminal, ExternalLink, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

export default function AgyAuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // info, success, error

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/auth/agy/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.authenticated) {
          setMessage('AGY is connected and authenticated with your Google account.');
          setMessageType('success');
        } else {
          setMessage(data.installed ? 'Authentication required. Click below to log in.' : 'agy CLI is not installed in PATH.');
          setMessageType(data.installed ? 'info' : 'error');
        }
      }
    } catch (err) {
      console.error('Failed to fetch AGY status', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  const handleLaunchTerminal = async () => {
    setLoading(true);
    setMessage('Launching interactive terminal login...');
    setMessageType('info');
    try {
      const res = await fetch('/api/auth/agy/login-terminal', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage('Terminal opened! Complete the login in the terminal window, then click "Refresh Status" below.');
        setMessageType('success');
      } else {
        setMessage(data.detail || 'Failed to open terminal emulator.');
        setMessageType('error');
      }
    } catch (err) {
      setMessage('Error launching terminal. Try running "agy" directly in your command line.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOAuth = async () => {
    setLoading(true);
    setMessage('Starting OAuth session and generating Google Sign-in link...');
    setMessageType('info');
    try {
      const res = await fetch('/api/auth/agy/start-oauth', { method: 'POST' });
      const data = await res.json();
      if (data.already_authenticated) {
        setMessage('You are already authenticated with Google Antigravity!');
        setMessageType('success');
        checkStatus();
        if (onAuthSuccess) onAuthSuccess();
      } else if (data.auth_url) {
        setAuthUrl(data.auth_url);
        window.open(data.auth_url, '_blank');
        setMessage('Google Sign-in page opened in a new tab. Authorize CaesarOps, then paste your code below.');
        setMessageType('info');
      } else {
        setMessage(data.message || 'Could not initiate OAuth. Use Terminal Login.');
        setMessageType('info');
      }
    } catch (err) {
      setMessage('Failed to generate OAuth URL.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setMessage('Verifying authorization code with Google...');
    setMessageType('info');
    try {
      const res = await fetch('/api/auth/agy/submit-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('🎉 Successfully logged in to Google Antigravity (AGY)!');
        setMessageType('success');
        setCode('');
        setAuthUrl('');
        checkStatus();
        if (onAuthSuccess) onAuthSuccess();
      } else {
        setMessage(data.message || 'Code verification failed. Please try again.');
        setMessageType('error');
      }
    } catch (err) {
      setMessage('Network error during code submission.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Antigravity (AGY) Authentication</h3>
            <p className="text-xs text-slate-400 font-mono">OAuth 2.0 CLI Session Manager</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="mb-5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Current Status:</span>
          <div className="flex items-center gap-2 font-mono">
            {status?.authenticated ? (
              <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected ({status.version || 'v1.3.5'})
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5" /> Not Authenticated
              </span>
            )}
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mb-5 p-3 rounded-xl text-xs flex items-start gap-2.5 border ${
            messageType === 'success' ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' :
            messageType === 'error' ? 'bg-rose-950/30 border-rose-800/40 text-rose-300' :
            'bg-indigo-950/30 border-indigo-800/40 text-indigo-300'
          }`}>
            {messageType === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />}
            {messageType === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />}
            {messageType === 'info' && <KeyRound className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />}
            <span className="leading-relaxed">{message}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <button
            onClick={handleLaunchTerminal}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-all disabled:opacity-50"
          >
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Open in Terminal</span>
          </button>

          <button
            onClick={handleStartOAuth}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            <span>Sign In with Google</span>
          </button>
        </div>

        {/* Auth URL Direct Link (if open popup was blocked) */}
        {authUrl && (
          <div className="mb-4 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 block mb-1">Popup blocked? Click here to authorize:</span>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline break-all block font-mono text-[11px]"
            >
              {authUrl.slice(0, 75)}...
            </a>
          </div>
        )}

        {/* Authorization Code Input Box */}
        {authUrl && (
          <form onSubmit={handleSubmitCode} className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Authorization Code from Google:
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste the Google OAuth code here..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50 shadow-md shadow-emerald-600/20"
            >
              {loading ? 'Submitting...' : 'Complete Authentication'}
            </button>
          </form>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-500">
          <button
            type="button"
            onClick={checkStatus}
            className="hover:text-slate-300 transition-colors"
          >
            🔄 Refresh Status
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
