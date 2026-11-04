import { useEffect, useState } from 'react';
import { Radio, Save, X } from 'lucide-react';
import { api } from '../api/client';
import './WakeBridgeSettings.css';

type WakeBridgePreferences = {
  enabled: boolean;
  wakeWord: string;
  pollIntervalMinutes: number;
  maxLifelogsPerPull: number;
};

type WakeBridgeLimits = {
  minPollIntervalMinutes: number;
  maxPollIntervalMinutes: number;
  maxWakeWordLength: number;
  defaultWakeWord: string;
  maxLifelogsPerPull: number;
};

interface WakeBridgeSettingsProps {
  onClose: () => void;
}

const fallbackLimits: WakeBridgeLimits = {
  minPollIntervalMinutes: 1,
  maxPollIntervalMinutes: 15,
  maxWakeWordLength: 32,
  defaultWakeWord: 'Hermes',
  maxLifelogsPerPull: 25
};

export function WakeBridgeSettings({ onClose }: WakeBridgeSettingsProps) {
  const [preferences, setPreferences] = useState<WakeBridgePreferences | null>(null);
  const [limits, setLimits] = useState<WakeBridgeLimits>(fallbackLimits);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get<{ preferences: WakeBridgePreferences; limits: WakeBridgeLimits }>('/wake-bridge/preferences');
        setPreferences(response.data.preferences);
        setLimits(response.data.limits);
      } catch (error: any) {
        setMessage({ tone: 'error', text: error.response?.data?.message || 'Could not load pendant bridge settings.' });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const update = (patch: Partial<WakeBridgePreferences>) => {
    setPreferences((current) => current ? { ...current, ...patch } : current);
  };

  const save = async () => {
    if (!preferences) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await api.put<{ preferences: WakeBridgePreferences }>('/wake-bridge/preferences', preferences);
      setPreferences(response.data.preferences);
      setMessage({ tone: 'success', text: 'Pendant bridge settings saved. The next scheduled check uses them.' });
    } catch (error: any) {
      setMessage({ tone: 'error', text: error.response?.data?.message || 'Could not save pendant bridge settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wake-bridge-overlay" onClick={onClose} role="presentation">
      <section className="wake-bridge-panel" onClick={(event) => event.stopPropagation()} aria-label="Pendant command bridge settings">
        <header className="wake-bridge-header">
          <div>
            <div className="wake-bridge-kicker"><Radio size={15} /> Ambient commands</div>
            <h2>Pendant Command Bridge</h2>
            <p>Control how Memento checks finalized pendant transcripts for an explicit wake word and command.</p>
          </div>
          <button className="wake-bridge-close" onClick={onClose} aria-label="Close pendant command bridge settings"><X size={20} /></button>
        </header>

        {loading ? (
          <div className="wake-bridge-loading">Loading bridge settings…</div>
        ) : preferences ? (
          <div className="wake-bridge-content">
            <label className="wake-bridge-switch-row">
              <span>
                <strong>Check for pendant commands</strong>
                <small>Pause polling without removing the protected Hermes connection.</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
            </label>

            <div className="wake-bridge-fields">
              <label className="wake-bridge-wide-field">
                <span>Wake word</span>
                <input
                  className="wake-bridge-text-input"
                  type="text"
                  maxLength={limits.maxWakeWordLength}
                  value={preferences.wakeWord}
                  onChange={(event) => update({ wakeWord: event.target.value })}
                  placeholder={limits.defaultWakeWord}
                  aria-label="Wake word"
                />
                <small>Say “Hey {preferences.wakeWord || limits.defaultWakeWord}” or “{preferences.wakeWord || limits.defaultWakeWord}” at the beginning of a pendant utterance. Letters, spaces, and hyphens only.</small>
              </label>

              <label>
                <span>Poll every</span>
                <div className="wake-bridge-input-suffix">
                  <input
                    type="number"
                    min={limits.minPollIntervalMinutes}
                    max={limits.maxPollIntervalMinutes}
                    value={preferences.pollIntervalMinutes}
                    onChange={(event) => update({ pollIntervalMinutes: Number(event.target.value) })}
                  />
                  <em>minutes</em>
                </div>
                <small>Choose {limits.minPollIntervalMinutes}–{limits.maxPollIntervalMinutes} minutes. Memento applies a saved change without a restart.</small>
              </label>

              <label>
                <span>Max lifelogs per pull</span>
                <div className="wake-bridge-input-suffix">
                  <input
                    type="number"
                    min="1"
                    max={limits.maxLifelogsPerPull}
                    value={preferences.maxLifelogsPerPull}
                    onChange={(event) => update({ maxLifelogsPerPull: Number(event.target.value) })}
                  />
                  <em>lifelogs</em>
                </div>
                <small>Maximum {limits.maxLifelogsPerPull}. Larger requests lose the transcript text the bridge needs to read.</small>
              </label>
            </div>

            <div className="wake-bridge-note">
              <strong>What Memento does not save:</strong> the spoken command text. It keeps metadata-only audit records and sends a signed event to Hermes.
            </div>

            {message && <div className={`wake-bridge-message ${message.tone}`}>{message.text}</div>}

            <footer className="wake-bridge-actions">
              <button className="wake-bridge-cancel" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="wake-bridge-save" onClick={() => void save()} disabled={saving}>
                <Save size={16} /> {saving ? 'Saving…' : 'Save bridge settings'}
              </button>
            </footer>
          </div>
        ) : (
          <div className="wake-bridge-loading">{message?.text || 'No settings are available.'}</div>
        )}
      </section>
    </div>
  );
}
