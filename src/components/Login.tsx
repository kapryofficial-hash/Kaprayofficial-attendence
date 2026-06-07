import React, { useState } from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { AllowedUserRole } from '../types';
import { Lock, Mail, Eye, EyeOff, Key, ShieldCheck, Loader2, Copy, Check } from 'lucide-react';

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
  const [sqlCopied, setSqlCopied] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    enteredIdentifier: string;
    authUserId: string;
    authUserEmail: string;
    profileRowFound: string;
    userRolesRowFound: string;
    detectedRole: string;
    finalAccessDecision: string;
    exactError: string;
  } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both your email/username and password.');
      return;
    }

    // Clear old localStorage and sessionStorage keys containing 'role', 'profile', 'auth', 'administrator', 'workspace', 'access'
    const targetSubstrings = ['role', 'profile', 'auth', 'administrator', 'workspace', 'access'];
    
    try {
      const keysFromLocal = Object.keys(localStorage);
      keysFromLocal.forEach(k => {
        const lower = k.toLowerCase();
        if (targetSubstrings.some(sub => lower.includes(sub))) {
          localStorage.removeItem(k);
        }
      });

      const keysFromSession = Object.keys(sessionStorage);
      keysFromSession.forEach(k => {
        const lower = k.toLowerCase();
        if (targetSubstrings.some(sub => lower.includes(sub))) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (cacheErr) {
      console.warn('Cache clear failed safely:', cacheErr);
    }

    const cleanIdentifier = email.trim();
    let resolvedEmail = cleanIdentifier;
    let profileRowObj: any = null;
    let roleRowObj: any = null;
    let detectedRoleStr = 'none';
    let finalDecisionStr = 'Denied (Pending checks)';
    let authedUser: any = null;

    setLoading(true);
    setErrorMsg(null);
    setPendingRoleUser(null);
    setDebugInfo(null);

    try {
      const isProductionNetlify = window.location.hostname.includes('netlify.app') || window.location.hostname.includes('netlify.com');
      const isDevOrPreview = !isProductionNetlify && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('run.app') ||
        window.location.hostname.includes('gitpod') ||
        window.location.hostname.includes('github.dev')
      );

      const supabase = getSupabaseClient();
      if (!supabase) {
        const isApprovedAdmin = cleanIdentifier === 'ahzammaqsood1@gmail.com' || cleanIdentifier === 'kapryofficial@gmail.com';
        if (isApprovedAdmin && isDevOrPreview) {
          console.warn(`Fallback login accepted without Supabase connection for ${cleanIdentifier}`);
          const mockUser = {
            id: 'fallback_admin_id',
            email: cleanIdentifier,
            user_metadata: { name: 'Admin Fallback' }
          };
          localStorage.setItem('fallback_admin_user', JSON.stringify(mockUser));
          onLoginSuccess(mockUser, 'super_admin', null);
          return;
        }
        throw new Error('Supabase client is not configured. Please verify your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables in Settings or register connections in the Database Setup modal.');
      }

      // 1. If identifier is username, lookup profiles.username.
      // If identifier is email, use it directly for Supabase Auth login.
      if (!resolvedEmail.includes('@')) {
        const { data: profileRes, error: lookupError } = await supabase
          .from('profiles')
          .select('user_id, username, email, role')
          .eq('username', resolvedEmail)
          .maybeSingle();

        if (lookupError) {
          throw new Error(`Username profile lookup failed: ${lookupError.message}`);
        }

        if (!profileRes) {
          throw new Error(`Username "${resolvedEmail}" mapping was not found in the profiles table.`);
        }

        if (!profileRes.email) {
          throw new Error('Profile email missing');
        }

        profileRowObj = profileRes;
        resolvedEmail = profileRes.email; // Map verified email
      } else {
        // If identifier is email, use it directly for Supabase Auth login.
        // Try a safe profile lookup, but do not crash login if it misses or fails (Fallback)
        try {
          const { data: profileRes } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', resolvedEmail.toLowerCase())
            .maybeSingle();
          if (profileRes) {
            profileRowObj = profileRes;
          }
        } catch (err) {
          console.warn('Non-blocking user profiles load skipped:', err);
        }
      }

      // 4. Authenticate with Supabase using email/password
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

      if (authError) {
        throw authError;
      }

      authedUser = authData.user;
      if (!authedUser) {
        throw new Error('Could not retrieve authenticated user details after auth flow.');
      }

      // Fetch BOTH user_roles and profiles in parallel using authenticating UID
      // 2. Query public.user_roles: select * from user_roles where user_id = session.user.id
      // 3. Query public.profiles: select * from profiles where user_id = session.user.id
      let rRes: any = null;
      let pRes: any = null;
      try {
        const [rolesResult, profilesResult] = await Promise.all([
          supabase.from('user_roles').select('*').eq('user_id', authedUser.id).maybeSingle(),
          supabase.from('profiles').select('*').eq('user_id', authedUser.id).maybeSingle()
        ]);
        rRes = rolesResult;
        pRes = profilesResult;
      } catch (innerQueryErr: any) {
        console.error('Core role fetch query crashed:', innerQueryErr);
      }

      if (rRes?.data) {
        roleRowObj = rRes.data;
      }
      if (pRes?.data) {
        profileRowObj = pRes.data;
      }

      // 4. If user_roles.role = 'super_admin' OR profiles.role = 'super_admin': allow full dashboard access.
      let activeRole = null;
      let activeEmployeeId = null;

      const isProduction = isProductionNetlify || !isDevOrPreview;

      if (isProduction) {
        // Production access must require: profiles.role = super_admin OR user_roles.role = super_admin
        const hasDbSuperAdmin = roleRowObj?.role === 'super_admin' || profileRowObj?.role === 'super_admin';
        if (hasDbSuperAdmin) {
          activeRole = 'super_admin';
          activeEmployeeId = null;
        } else {
          activeRole = null;
          activeEmployeeId = null;
        }
      } else {
        if (roleRowObj?.role === 'super_admin' || profileRowObj?.role === 'super_admin') {
          activeRole = 'super_admin';
          activeEmployeeId = null; // 5. Do not require employee_id for super_admin.
        } else {
          activeRole = roleRowObj?.role || profileRowObj?.role || null;
          activeEmployeeId = roleRowObj?.employee_id || null;
        }
      }

      if (activeRole) {
        detectedRoleStr = activeRole;
      }

      const isAllowed = (activeRole === 'super_admin' || roleRowObj?.role === 'super_admin' || profileRowObj?.role === 'super_admin');
      const finalAccessDecision = isAllowed ? 'ALLOW' : (activeRole ? `ALLOW (${activeRole})` : 'DENY');

      console.log('--- LOGIN ACCESS GUARD EVALUATION ---');
      console.log('auth user id:', authedUser.id);
      console.log('profile role:', profileRowObj?.role || 'none');
      console.log('user_roles role:', roleRowObj?.role || 'none');
      console.log('final access decision:', finalAccessDecision);
      console.log('------------------------------------');

      if (!activeRole) {
        // Safe authenticated but unauthorized state
        setPendingRoleUser(authedUser);
        // Explicitly signOut so they don't block subsequent logins
        await supabase.auth.signOut();
        throw new Error(`Authenticated successfully as ${resolvedEmail}, but no authorized role mapping was located in 'user_roles' or 'profiles' table (UID: ${authedUser.id}).`);
      }

      finalDecisionStr = finalAccessDecision;

      // 9, 11: Clear old stored roles or Administrator cache keys from localStorage and sessionStorage
      const obsoleteKeys = [
        'user_role', 'role', 'userRole', 'Administrator', 'user_roles', 'excel_erp_active_role',
        'active_role', 'user_profile', 'profile', 'excel_erp_active_profile', 'access_decision', 'access_rejected',
        'auth_role', 'user_id', 'workspace_role', 'activeRole', 'authRole', 'auth', 'access'
      ];
      try {
        obsoleteKeys.forEach(k => {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        });
      } catch (cacheErr) {
        console.warn('Post-auth cache clear failed safely:', cacheErr);
      }

      // Successfully authenticated and authorized
      onLoginSuccess(authedUser, activeRole as AllowedUserRole, activeEmployeeId);

    } catch (err: any) {
      const exactErrorMsg = err.message || JSON.stringify(err);
      setErrorMsg(exactErrorMsg);

      // (Requirement 10): Save debug info for the diagnostic overlay
      setDebugInfo({
        enteredIdentifier: cleanIdentifier,
        authUserId: authedUser?.id || 'none',
        authUserEmail: resolvedEmail || 'none',
        profileRowFound: profileRowObj ? JSON.stringify(profileRowObj, null, 2) : 'none',
        userRolesRowFound: roleRowObj ? JSON.stringify(roleRowObj, null, 2) : 'none',
        detectedRole: detectedRoleStr,
        finalAccessDecision: finalDecisionStr,
        exactError: exactErrorMsg
      });
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

          {debugInfo && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-left text-[10px] text-slate-300 font-mono mb-6 space-y-3 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-rose-400 font-semibold text-[11px]">DEBUG DIAGNOSTICS</span>
                <span className="text-slate-500 text-[9px]">Requirement 10</span>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Entered Identifier:</span>
                  <span className="text-slate-100 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 inline-block">{debugInfo.enteredIdentifier}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Resolved Auth Email:</span>
                  <span className="text-indigo-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 inline-block">{debugInfo.authUserEmail}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Auth.User.ID:</span>
                  <span className="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 inline-block">{debugInfo.authUserId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Profile Row Found:</span>
                  <pre className="bg-slate-950 p-2 rounded border border-slate-850 overflow-x-auto whitespace-pre-wrap max-h-24 text-slate-400">{debugInfo.profileRowFound}</pre>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">User_roles Row Found:</span>
                  <pre className="bg-slate-950 p-2 rounded border border-slate-850 overflow-x-auto whitespace-pre-wrap max-h-24 text-slate-400">{debugInfo.userRolesRowFound}</pre>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Detected Role:</span>
                  <span className="text-amber-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-bold uppercase inline-block">{debugInfo.detectedRole}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Final Access Decision:</span>
                  <span className={`px-1.5 py-0.5 rounded border font-bold uppercase inline-block ${debugInfo.finalAccessDecision.includes('Allowed') ? 'text-emerald-400 bg-emerald-950/20 border-emerald-800' : 'text-rose-400 bg-rose-950/20 border-rose-800'}`}>{debugInfo.finalAccessDecision}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Exact Error:</span>
                  <p className="bg-rose-950/20 text-rose-300 p-2 rounded border border-rose-900/30 whitespace-pre-wrap">{debugInfo.exactError}</p>
                </div>
              </div>
            </div>
          )}

          {pendingRoleUser && (() => {
            const sqlText = `-- 1. Remove old admin setup (if any) to prevent duplication conflicts
DELETE FROM public.user_roles WHERE role = 'super_admin';
DELETE FROM public.profiles WHERE role = 'super_admin';

-- 2. Link your current active account to Profiles table
INSERT INTO public.profiles (user_id, username, display_name, role, email)
VALUES (
  '${pendingRoleUser.id}',
  '${(pendingRoleUser.email || '').split('@')[0]}',
  'Super Admin',
  'super_admin',
  '${pendingRoleUser.email}'
)
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';

-- 3. Link your current active account to Super Admin role in user_roles table
INSERT INTO public.user_roles (id, user_id, role, employee_id)
VALUES (
  'role_super_admin',
  '${pendingRoleUser.id}',
  'super_admin',
  NULL
)
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, role = 'super_admin';`;

            const handleCopySql = () => {
              navigator.clipboard.writeText(sqlText);
              setSqlCopied(true);
              setTimeout(() => setSqlCopied(false), 3000);
            };

            return (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs mb-6 space-y-3.5 animation-in fade-in slide-in-from-top-2 text-left">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-400 text-sm block">Aapka Password Sahi Hai! ✅</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">Your email & password are authenticated successfully!</span>
                  </div>
                </div>

                <div className="text-slate-300 space-y-2 text-[11px] leading-relaxed border-t border-slate-800 pt-3">
                  <p>
                    <strong className="text-amber-200">Wajah (Reason):</strong> Aapne SQL editor mein purana account ID daal kar run kiya tha. Aapke naye aur active account ki real ID (<span className="text-emerald-400 font-mono font-bold bg-slate-900 px-1 py-0.5 rounded">{pendingRoleUser.id}</span>) system roles mein exists nahi karti.
                  </p>
                  <p className="text-slate-400">
                    Your current active user ID has changed. You must link this new UID to the <span className="text-amber-300 font-semibold">super_admin</span> role in your Supabase SQL Editor to gain full access.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neeche diye gaye Query ko copy karke Supabase SQL Editor mein run karein:</span>
                  <div className="relative font-mono text-[10px] bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 max-h-48 overflow-y-auto selection:bg-emerald-500/30">
                    <pre className="whitespace-pre-wrap select-text">{sqlText}</pre>
                    <button
                      type="button"
                      onClick={handleCopySql}
                      className="absolute top-2 right-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 p-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      {sqlCopied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-[9px] text-emerald-400 px-0.5">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span className="text-[9px] px-0.5">Copy SQL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800/60 p-2.5 rounded-lg text-[10px] text-slate-400 space-y-1">
                  <p className="font-medium text-amber-400/90 text-[10.5px]">Steps to apply:</p>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Copy SQL button par click karke query copy karein.</li>
                    <li>Supabase Dashboard ke <strong className="text-slate-300 font-medium">SQL Editor</strong> tab par jayein.</li>
                    <li>Sari purani commands hata kar is naye query ko daalein aur <strong className="text-emerald-400 font-medium">"Run" (Ctrl + Enter)</strong> karein.</li>
                    <li>Query run hone ke baad, wapas is page par aa kar apna sahi email aur password daal kar login karein.</li>
                  </ol>
                </div>
              </div>
            );
          })()}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 select-none">Username or Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. ahzammaqsood or adeel@kaprayofficial.com"
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
