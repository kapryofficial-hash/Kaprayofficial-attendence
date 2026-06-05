import React, { useState } from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { AllowedUserRole } from '../types';
import { Lock, Mail, Eye, EyeOff, Key, ShieldCheck, Loader2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: any, role: AllowedUserRole, employeeId: string | null) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingRoleUser, setPendingRoleUser] = useState<any | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setPendingRoleUser(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client is not configured. Please register connection details in top SQL config modal.');
      }

      // 1. Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      const currentUser = data.user;
      if (!currentUser) {
        throw new Error('Could not retrieve user details after authentication.');
      }

      // 2. Load role of authenticated user
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role, employee_id')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (roleError) {
        console.error('Failed to load user role:', roleError);
        // Let's sign out to keep state clean if reading roles is forbidden or broken
        await supabase.auth.signOut();
        throw new Error(`Authentication check failed: ${roleError.message}`);
      }

      if (!roleData || !roleData.role) {
        // Safe authenticated but unauthorized state
        setPendingRoleUser(currentUser);
        // Explicitly signOut so they don't block subsequent logins
        await supabase.auth.signOut();
        return;
      }

      // Log in success redirect
      onLoginSuccess(currentUser, roleData.role as AllowedUserRole, roleData.employee_id || null);

    } catch (err: any) {
      setErrorMsg(err.message || 'Incorrect email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-screen-wrapper" className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-12 selection:bg-emerald-500/20 select-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.05),transparent_50%)] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-850 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative z-10 transition-all duration-300">
        
        {/* Card Header Panel */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-8 text-center">
          <div className="h-12 w-12 bg-emerald-600 rounded-2xl mx-auto flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-emerald-600/20 mb-3 animate-pulse">
            KO
          </div>
          <h2 className="text-white font-bold text-xl tracking-tight">KaprayOfficial</h2>
          <p className="text-slate-400 text-xs mt-1 font-medium select-none">Staff Duty & Daily Worksheet System</p>
        </div>

        {/* Form elements container */}
        <div className="p-6 sm:p-8">
          {errorMsg && (
            <div className="bg-rose-500/15 border border-rose-500/35 text-rose-400 rounded-lg p-3 text-xs flex gap-2 mb-6 animation-in fade-in slide-in-from-top-2">
              <span className="font-bold">Error:</span>
              <p className="flex-1">{errorMsg}</p>
            </div>
          )}

          {pendingRoleUser && (
            <div className="bg-amber-500/15 border border-amber-500/35 text-amber-400 rounded-lg p-3 text-xs mb-6 space-y-2 animation-in fade-in slide-in-from-top-2">
              <div className="flex gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="font-bold">Access Allocation Pending</span>
              </div>
              <p className="leading-relaxed">
                Your credentials are correct, but your account (<span className="font-semibold text-white">{pendingRoleUser.email}</span>) does not have any authorized system role yet.
              </p>
              <p className="text-[11px] text-slate-400 border-t border-amber-500/20 pt-1.5 font-semibold">
                Please contact your Super Administrator to provision your permission role in the User Management system.
              </p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 select-none">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. adeel@kaprayofficial.com"
                  className="w-full text-xs bg-slate-900 border border-slate-800 text-white rounded-lg pl-9 pr-4 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-600 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 select-none">Password</label>
              <div className="relative">
                <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs bg-slate-900 border border-slate-800 text-white rounded-lg pl-9 pr-10 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-600 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 h-5 w-5 text-slate-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/10 hover:shadow-emerald-500/20 select-none disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-emerald-200" />
                  <span>Secure Access Login</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-800 pt-4 text-center">
            <span className="text-[10px] text-slate-500 font-medium select-none">
              KaprayOfficial Attendance Suite. Protected by Row-Level Security Policies.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
