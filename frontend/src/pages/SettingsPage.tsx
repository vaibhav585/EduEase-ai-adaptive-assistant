import React from 'react';
import {
  Contrast,
  Ear,
  Eye,
  Gauge,
  Image as ImageIcon,
  Mic,
  Sparkles,
  Type,
  Volume2,
  Wand2,
  Zap,
} from 'lucide-react';

import { useProfile } from '../hooks/useProfile';
import { notify } from '../services/notify';
import { Disability, DISABILITY_LABELS, Severity } from '../types/profile';

/**
 * Makes every accessibility preference captured at signup (Phase 0) actually
 * reachable afterward. Before this page existed, `profile.prefs` could only be
 * set once, at registration — a student who wanted to turn on high contrast or
 * change their reading speed later had no way to. Carried forward since §0.6.
 */

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = ({ checked, onChange, label, description, icon }) => (
  <label className="flex items-start gap-4 py-4 first:pt-0 last:pb-0 cursor-pointer group">
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary-50 text-primary-600 group-hover:bg-primary-100 transition">
      {icon}
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <span className="block text-sm text-slate-500 mt-0.5">{description}</span>
    </span>
    <span className="shrink-0 pt-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2
          ${checked ? 'bg-primary-600' : 'bg-slate-300'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
            ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </span>
  </label>
);

const SettingsPage: React.FC = () => {
  const { profile, loading, savePrefs, saveProfile } = useProfile();
  const [saving, setSaving] = React.useState<string | null>(null);

  const set = async (key: string, patch: Parameters<typeof savePrefs>[0]) => {
    setSaving(key);
    try {
      await savePrefs(patch);
    } catch (err) {
      console.error('Failed to save preference:', err);
      notify('Could not save that setting. Please try again.', { kind: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const isBlindOrLowVision = profile.disabilities.some((d) => d === 'blind' || d === 'low_vision');
  const webcamOffered = !isBlindOrLowVision;

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-slate-600" role="status">
        Loading your settings…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold text-primary-800 flex items-center justify-center gap-2">
          <Wand2 className="h-7 w-7 text-primary-600" aria-hidden="true" />
          Accessibility Settings
        </h1>
        <p className="text-slate-600 mt-1">
          Change how EduEase looks, sounds, and responds to you. These apply everywhere, right away.
        </p>
      </div>

      <section className="bg-white rounded-card shadow-md p-6 border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Reading &amp; display
        </h2>
        <div className="divide-y divide-slate-100">
          <Toggle
            icon={<Type className="h-5 w-5" aria-hidden="true" />}
            label="Dyslexia-friendly font"
            description="Switches to Atkinson Hyperlegible, a typeface designed for easier reading."
            checked={profile.prefs.dyslexiaFont}
            onChange={(v) => void set('dyslexiaFont', { dyslexiaFont: v })}
          />
          <Toggle
            icon={<Contrast className="h-5 w-5" aria-hidden="true" />}
            label="High contrast"
            description="Darker text and clearer borders throughout the app."
            checked={profile.prefs.highContrast}
            onChange={(v) => void set('highContrast', { highContrast: v })}
          />
          <Toggle
            icon={<Zap className="h-5 w-5" aria-hidden="true" />}
            label="Reduce motion"
            description="Turns off animations and transitions."
            checked={profile.prefs.reduceMotion}
            onChange={(v) => void set('reduceMotion', { reduceMotion: v })}
          />
        </div>

        <div className="pt-5 mt-1 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <label htmlFor="font-scale" className="text-sm font-semibold text-slate-800">
              Text size: {Math.round(profile.prefs.fontScale * 100)}%
            </label>
          </div>
          <input
            id="font-scale"
            type="range"
            min={1}
            max={2}
            step={0.1}
            value={profile.prefs.fontScale}
            onChange={(e) => void set('fontScale', { fontScale: Number(e.target.value) })}
            className="w-full accent-primary-600"
          />
        </div>
      </section>

      <section className="bg-white rounded-card shadow-md p-6 border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Voice &amp; sound
        </h2>
        <div className="divide-y divide-slate-100">
          <Toggle
            icon={<Volume2 className="h-5 w-5" aria-hidden="true" />}
            label="Read lessons aloud automatically"
            description="Text-to-speech starts automatically where available."
            checked={profile.prefs.ttsEnabled}
            onChange={(v) => void set('ttsEnabled', { ttsEnabled: v })}
          />
          <Toggle
            icon={<Mic className="h-5 w-5" aria-hidden="true" />}
            label="Voice navigation"
            description="Control EduEase with spoken commands like “go to my quizzes.”"
            checked={profile.prefs.voiceNav}
            onChange={(v) => void set('voiceNav', { voiceNav: v })}
          />
          <Toggle
            icon={<Ear className="h-5 w-5" aria-hidden="true" />}
            label="Always show captions"
            description="Show on-screen captions for every spoken message, not just voice commands."
            checked={profile.prefs.captionsAlways}
            onChange={(v) => void set('captionsAlways', { captionsAlways: v })}
          />
          {isBlindOrLowVision && (
            <Toggle
              icon={<ImageIcon className="h-5 w-5" aria-hidden="true" />}
              label="Describe images in PDFs"
              description="Images in uploaded lessons get an educational description you can hear, not just alt-text."
              checked={profile.prefs.describeImages}
              onChange={(v) => void set('describeImages', { describeImages: v })}
            />
          )}
          {webcamOffered && (
            <Toggle
              icon={<Eye className="h-5 w-5" aria-hidden="true" />}
              label="Camera focus check"
              description="Uses your camera to gently notice when you look away. Never recorded or sent anywhere."
              checked={profile.prefs.webcamAttention}
              onChange={(v) => void set('webcamAttention', { webcamAttention: v })}
            />
          )}
        </div>

        <div className="pt-5 mt-1 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <label htmlFor="tts-rate" className="text-sm font-semibold text-slate-800">
              Speech rate: {profile.prefs.ttsRate.toFixed(1)}x
            </label>
          </div>
          <input
            id="tts-rate"
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={profile.prefs.ttsRate}
            onChange={(e) => void set('ttsRate', { ttsRate: Number(e.target.value) })}
            className="w-full accent-primary-600"
          />
        </div>
      </section>

      <section className="bg-white rounded-card shadow-md p-6 border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Your support profile
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          This shapes how lessons and quizzes are written for you. Change it any time — nothing here
          is required.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {(Object.keys(DISABILITY_LABELS) as Disability[]).map((d) => {
            const active = profile.disabilities.includes(d);
            return (
              <label
                key={d}
                className="flex items-center gap-2 text-sm text-slate-700 py-1.5 px-2 rounded-control cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-600"
                  checked={active}
                  onChange={() =>
                    void saveProfile({
                      disabilities: active
                        ? profile.disabilities.filter((x) => x !== d)
                        : [...profile.disabilities, d],
                      primary: active && profile.primary === d ? null : profile.primary,
                    })
                  }
                />
                {DISABILITY_LABELS[d]}
              </label>
            );
          })}
        </div>

        {profile.disabilities.length > 1 && (
          <div>
            <label htmlFor="primary-disability" className="block text-xs font-bold text-slate-700 mb-1">
              Which affects your learning most?
            </label>
            <select
              id="primary-disability"
              value={profile.primary ?? ''}
              onChange={(e) => void saveProfile({ primary: (e.target.value || null) as Disability | null })}
              className="w-full rounded-control border border-slate-300 py-2 px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Choose one</option>
              {profile.disabilities.map((d) => (
                <option key={d} value={d}>
                  {DISABILITY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
        )}

        {profile.disabilities.length > 0 && (
          <div className="mt-4">
            <label htmlFor="severity" className="block text-xs font-bold text-slate-700 mb-1">
              How much does it affect your studying?
            </label>
            <select
              id="severity"
              value={profile.severity ?? ''}
              onChange={(e) => void saveProfile({ severity: (e.target.value || null) as Severity | null })}
              className="w-full rounded-control border border-slate-300 py-2 px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Prefer not to say</option>
              <option value="mild">A little</option>
              <option value="moderate">Quite a lot</option>
              <option value="significant">A great deal</option>
            </select>
          </div>
        )}
      </section>

      {saving && (
        <p className="text-center text-xs text-slate-400" aria-live="polite">
          Saving {saving}…
        </p>
      )}
    </div>
  );
};

export default SettingsPage;
