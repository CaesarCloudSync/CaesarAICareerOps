import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed with this action?',
  confirmLabel = 'Yes, Delete',
  cancelLabel = 'No, Cancel',
  confirmVariant = 'danger', // 'danger' | 'warning' | 'primary'
  loading = false,
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-5 sm:pt-8 px-4 pointer-events-none">
      {/* Light backdrop so clicking outside closes, with pointer-events-auto */}
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Floating Toast Notification Modal (Pinned to Top of Viewport - No Scrolling Required!) */}
      <div
        className="pointer-events-auto relative z-10 bg-slate-900/95 border border-rose-500/40 shadow-2xl shadow-rose-950/80 rounded-2xl max-w-lg w-full p-4 sm:p-5 backdrop-blur-xl animate-in slide-in-from-top-6 zoom-in-95 duration-200 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                confirmVariant === 'danger'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : confirmVariant === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
              }`}
            >
              {confirmVariant === 'danger' ? (
                <Trash2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>

            <div className="space-y-1 flex-1 min-w-0 pr-2">
              <h3 className="font-bold text-sm text-white tracking-wide truncate">{title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">{message}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800 disabled:opacity-50 shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-3 mt-3 flex items-center justify-end gap-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50 ${
              confirmVariant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                : confirmVariant === 'warning'
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50'
            }`}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
