import React, { useState } from 'react';
import { 
  getSupabaseCredentials, 
  saveSupabaseCredentials, 
  SQL_SCHEMA_SCRIPT,
  SQL_MIGRATION_SCRIPT
} from '../supabaseClient';
import { runDatabaseDiagnostic, DiagnosticResult } from '../backendService';
import { Database, AlertTriangle, CheckCircle2, Copy, RefreshCw, X } from 'lucide-react';

interface SqlConfigModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function SqlConfigModal({ onClose, onSaved }: SqlConfigModalProps) {
  const [credentials, setCredentials] = useState(getSupabaseCredentials());
  const [url, setUrl] = useState(credentials.url);
  const [key, setKey] = useState(credentials.key);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'fresh' | 'migration'>('migration'); // Default to migration tab because schema needs upgrade
  
  const [diagnosticResults, setDiagnosticResults] = useState<DiagnosticResult[] | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseCredentials(url, key);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onSaved();
      // Auto-trigger diagnostic upon saving
      runAudit();
    }, 1200);
  };

  const handleClear = () => {
    setUrl('');
    setKey('');
    saveSupabaseCredentials('', '');
    setDiagnosticResults(null);
    onSaved();
  };

  const runAudit = async () => {
    setIsDiagnosing(true);
    setDiagnosticError(null);
    try {
      const res = await runDatabaseDiagnostic();
      setDiagnosticResults(res);
    } catch (err: any) {
      setDiagnosticError(err.message || 'Diagnostic scan failed');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const copyToClipboard = () => {
    const textToCopy = activeTab === 'fresh' ? SQL_SCHEMA_SCRIPT : SQL_MIGRATION_SCRIPT;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="sql-config-modal-backdrop" className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div id="sql-config-modal" className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="font-semibold text-base">Supabase Database Setup</h3>
              <p className="text-xs text-slate-400">Connect to your permanent cloud database storage</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Instructions */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 leading-relaxed">
            <div className="font-semibold text-slate-800 text-sm mb-1">How can I connect my live Supabase backend?</div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline font-medium">supabase.com</a>.</li>
              <li>Go to <strong>Project Settings → API</strong>, copy your <strong>Project URL</strong> and <strong>anon public key</strong>.</li>
              <li>Enter them in the form below and click <strong>"Verify & Connect Backend"</strong>.</li>
              <li>Copy the SQL script below, open the <strong>SQL Editor</strong> in your Supabase dashboard, paste it, and run <strong>"Run"</strong> to initialize the schema instantly.</li>
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Credentials Form */}
            <form onSubmit={handleSave} className="space-y-4">
              <h4 className="font-medium text-slate-800 text-sm border-b pb-2">1. Connection Credentials</h4>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Supabase API URL</label>
                <input 
                  type="url" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Supabase Anon Key</label>
                <textarea 
                  rows={4}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button 
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Save & Bind Database
                </button>
                <button 
                  type="button"
                  onClick={handleClear}
                  className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Disconnect Mode
                </button>
              </div>

              {saveSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-2 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
                  <CheckCircle2 className="h-4 w-4" />
                  Credentials loaded! Re-synchronizing cloud worksheets...
                </div>
              )}
            </form>

            {/* SQL Script Viewer */}
            <div className="space-y-2 flex flex-col h-full">
              <div className="flex items-center justify-between">
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('migration')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      activeTab === 'migration' 
                        ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' 
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    1. Upgrade Patch SQL (Safe)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('fresh')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      activeTab === 'fresh' 
                        ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' 
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    2. Fresh Install SQL
                  </button>
                </div>
                <button 
                  type="button" 
                  onClick={copyToClipboard}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied' : 'Copy Code'}
                </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 text-[10px] font-mono text-emerald-400 overflow-y-auto h-64 border border-slate-800 leading-normal select-all">
                {activeTab === 'fresh' ? SQL_SCHEMA_SCRIPT : SQL_MIGRATION_SCRIPT}
              </div>
            </div>

          </div>

          {/* Real-time Database Schema Audit */}
          <div className="border-t border-slate-200 pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-800 text-sm">3. Real-Time Schema Audit Diagnostics</h4>
                <p className="text-xs text-slate-500">Scan connected Supabase tables to locate any missing columns or indices instantly.</p>
              </div>
              <button
                type="button"
                onClick={runAudit}
                disabled={isDiagnosing || !url || !key}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-medium text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isDiagnosing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Auditing Tables...
                  </>
                ) : (
                  <>
                    <Database className="h-3.5 w-3.5" />
                    Run Diagnostics Scan
                  </>
                )}
              </button>
            </div>

            {diagnosticError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs leading-relaxed">
                <p className="font-semibold text-red-800 mb-0.5">Audit failed to execute:</p>
                <p className="font-mono">{diagnosticError}</p>
              </div>
            )}

            {!diagnosticResults && !diagnosticError && (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-500">
                Configure your Supabase Credentials above and hit <strong className="text-slate-700">"Run Diagnostics Scan"</strong> to inspect table columns active in retirement schema.
              </div>
            )}

            {diagnosticResults && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-semibold text-slate-700">Inspected Table Suffixes</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    diagnosticResults.every(r => r.status === 'PASS') 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-amber-100 text-amber-800 animate-pulse'
                  }`}>
                    {diagnosticResults.every(r => r.status === 'PASS') ? 'ALL SCHEMAS SYNCED' : 'ACTION REQUIRED: OUTDATED SCHEMA'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {diagnosticResults.map((result) => (
                    <div 
                      key={result.tableName}
                      className={`p-3 rounded-lg border text-xs flex flex-col justify-between transition-all ${
                        result.status === 'PASS'
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                          : result.status === 'MISSING_TABLE'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-amber-50 border-amber-200 text-amber-950'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-mono font-bold text-slate-800">{result.tableName}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          result.status === 'PASS'
                            ? 'bg-emerald-600 text-white'
                            : result.status === 'MISSING_TABLE'
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-500 text-white'
                        }`}>
                          {result.status === 'PASS' ? 'pass' : result.status === 'MISSING_TABLE' ? 'table missing' : 'column fail'}
                        </span>
                      </div>

                      {result.errorMessage && (
                        <div className="bg-white/80 p-2 rounded border border-slate-200/50 font-mono text-[10px] text-slate-600 break-words mt-1">
                          {result.errorMessage}
                        </div>
                      )}

                      <div className="mt-2 text-[9px] text-slate-400 flex flex-wrap gap-1">
                        {result.columns.map(col => (
                          <span 
                            key={col.columnName}
                            className={`px-1 rounded font-mono ${
                              col.status === 'PASS' 
                                ? 'bg-emerald-100/60 text-emerald-800/80' 
                                : 'bg-rose-100 text-rose-800 font-bold decoration-rose-500'
                            }`}
                          >
                            {col.columnName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {!diagnosticResults.every(r => r.status === 'PASS') && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2 mt-2 leading-normal">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-bold text-amber-900">Wait! One or more tables are missing properties or missing entirely.</p>
                      <p className="mt-1">To fix this instantly without losing data: copy the <strong className="font-semibold text-emerald-700">1. Upgrade Patch SQL (Safe)</strong> code above, paste it inside your Supabase SQL Editor, and click "Run". This will patch the required columns immediately!</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1 text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span>Ensure you hit "Run" on this Postgres script so queries succeed securely!</span>
          </div>
          <button 
            onClick={onClose}
            className="hover:bg-slate-200 text-slate-700 font-medium px-4 py-1.5 rounded-md transition-colors border border-slate-300 cursor-pointer"
          >
            Close Setup
          </button>
        </div>

      </div>
    </div>
  );
}
