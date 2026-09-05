import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Save, Target } from 'lucide-react';
import { IcpAPI } from '../lib/api';
import { Button } from '../components/ui/Button';

const ICP_PRESETS = [
  {
    id: 'b2b-saas', label: 'B2B SaaS · North America', name: 'Demo B2B SaaS ICP',
    description: 'Mid-market software companies with a modern revenue stack.',
    target_industries: ['SaaS', 'B2B SaaS', 'Software', 'Cloud Software'], employee_min: 50, employee_max: 500,
    revenue_min: 5_000_000, revenue_max: 100_000_000, countries: ['United States', 'Canada'],
    technologies: ['CRM', 'Salesforce', 'HubSpot', 'AWS', 'GCP', 'Azure'],
  },
  {
    id: 'fintech', label: 'Fintech · UK & Europe', name: 'Fintech Expansion ICP',
    description: 'Regulated financial products scaling into repeatable growth.',
    target_industries: ['Fintech', 'Payments', 'Financial Services'], employee_min: 100, employee_max: 1_500,
    revenue_min: 10_000_000, revenue_max: 250_000_000, countries: ['United Kingdom', 'Germany', 'France', 'Ireland', 'Netherlands'],
    technologies: ['Stripe', 'AWS', 'Snowflake', 'Kubernetes', 'Salesforce'],
  },
  {
    id: 'healthtech', label: 'HealthTech · United States', name: 'HealthTech Growth ICP',
    description: 'Healthcare software teams with scale, compliance, and active buying signals.',
    target_industries: ['HealthTech', 'Healthcare Software', 'MedTech'], employee_min: 75, employee_max: 2_000,
    revenue_min: 10_000_000, revenue_max: 500_000_000, countries: ['United States', 'Canada'],
    technologies: ['FHIR', 'HL7', 'Epic', 'AWS', 'Azure', 'Snowflake'],
  },
  {
    id: 'commerce', label: 'Commerce · Growth Accounts', name: 'E-commerce Growth ICP',
    description: 'Digital commerce brands investing in retention and conversion tooling.',
    target_industries: ['E-commerce', 'Marketplace', 'Retail Technology'], employee_min: 25, employee_max: 1_000,
    revenue_min: 2_000_000, revenue_max: 200_000_000, countries: ['United States', 'United Kingdom', 'Australia'],
    technologies: ['Shopify', 'Magento', 'Klaviyo', 'Stripe', 'Google Analytics'],
  },
];

function toForm(profile) {
  return {
    name: profile.name || 'Default ICP',
    target_industries: (profile.target_industries || []).join(', '),
    employee_min: profile.employee_min ?? '', employee_max: profile.employee_max ?? '',
    revenue_min: profile.revenue_min ?? '', revenue_max: profile.revenue_max ?? '',
    countries: (profile.countries || []).join(', '), technologies: (profile.technologies || []).join(', '),
  };
}

function formatMoney(value) {
  if (value == null || value === '') return 'Any revenue';
  const amount = Number(value);
  if (amount >= 1_000_000) return `$${Math.round(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}

const initialForm = toForm(ICP_PRESETS[0]);

export default function SettingsPage() {
  const [form, setForm] = useState(initialForm);
  const [selectedPreset, setSelectedPreset] = useState(ICP_PRESETS[0].id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    IcpAPI.getLatest().then((data) => {
      setForm(toForm(data));
      setSelectedPreset(ICP_PRESETS.find((preset) => preset.name === data.name)?.id || null);
    }).catch((err) => {
      if (err.response?.status !== 404) setMessage({ type: 'error', text: 'The active ICP could not be loaded.' });
    }).finally(() => setLoading(false));
  }, []);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setSelectedPreset(null); setMessage(null);
  };
  const applyPreset = (preset) => { setForm(toForm(preset)); setSelectedPreset(preset.id); setMessage(null); };
  const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);

  const handleSubmit = async (event) => {
    event.preventDefault(); setMessage(null);
    const minEmployees = form.employee_min === '' ? null : Number(form.employee_min);
    const maxEmployees = form.employee_max === '' ? null : Number(form.employee_max);
    const minRevenue = form.revenue_min === '' ? null : Number(form.revenue_min);
    const maxRevenue = form.revenue_max === '' ? null : Number(form.revenue_max);
    if (minEmployees != null && maxEmployees != null && minEmployees > maxEmployees) return setMessage({ type: 'error', text: 'Minimum employees cannot exceed maximum employees.' });
    if (minRevenue != null && maxRevenue != null && minRevenue > maxRevenue) return setMessage({ type: 'error', text: 'Minimum revenue cannot exceed maximum revenue.' });
    setSaving(true);
    try {
      await IcpAPI.save({ name: form.name.trim(), target_industries: list(form.target_industries), employee_min: minEmployees, employee_max: maxEmployees, revenue_min: minRevenue, revenue_max: maxRevenue, countries: list(form.countries), technologies: list(form.technologies) });
      setMessage({ type: 'success', text: 'ICP profile saved. Future imports will use these rules.' });
    } catch (err) { setMessage({ type: 'error', text: err.response?.data?.error || 'The ICP profile could not be saved.' }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state"><span className="spinner" />Loading your active ICP…</div>;

  return (
    <div className="flow-page settings-page">
      <div className="page-header"><div><p className="eyebrow">Scoring rules</p><h1>Define the right account.</h1><p className="page-lede">Start with a proven profile, then tune the boundaries that shape your ranked queue.</p></div><div className="profile-chip"><Target size={16} />Active profile</div></div>
      <form className="workspace-panel settings-form" onSubmit={handleSubmit}>
        <div className="panel-heading"><div><h2>Ideal Customer Profile</h2><p>Choose a starting point or build your own. These rules apply to new imports and explain each priority score.</p></div></div>

        <fieldset className="preset-section">
          <legend className="preset-legend">Start from a playbook</legend>
          <div className="preset-heading"><p>Pick a profile that matches the market you want to work first.</p><span className="preset-count">{ICP_PRESETS.length} ready-made profiles</span></div>
          <div className="preset-grid">
            {ICP_PRESETS.map((preset) => (
              <label className={`preset-card ${selectedPreset === preset.id ? 'preset-card-selected' : ''}`} key={preset.id}>
                <input type="radio" name="icp-preset" value={preset.id} checked={selectedPreset === preset.id} onChange={() => applyPreset(preset)} />
                <span className="preset-card-body"><span className="preset-card-top"><strong>{preset.label}</strong><span className="preset-radio" aria-hidden="true" /></span><span className="preset-description">{preset.description}</span><span className="preset-meta">{preset.employee_min}–{preset.employee_max} employees · {formatMoney(preset.revenue_min)}–{formatMoney(preset.revenue_max)}</span><span className="preset-tags">{preset.technologies.slice(0, 3).map((technology) => <span key={technology}>{technology}</span>)}<span>+{Math.max(0, preset.technologies.length - 3)} more</span></span></span>
              </label>
            ))}
          </div>
          <p className="preset-footnote"><Info size={14} />Selecting a playbook fills the form below. You can edit any field before saving.</p>
        </fieldset>

        <div className="form-section"><div className="form-section-title"><span>01</span><div><h3>Who are you targeting?</h3><p>Use comma-separated values when there is more than one answer.</p></div></div><div className="form-grid"><label className="field field-wide"><span>Profile name</span><input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. B2B SaaS in the US" /></label><label className="field field-wide"><span>Target industries</span><input name="target_industries" value={form.target_industries} onChange={handleChange} placeholder="SaaS, Cloud Software, Software" /></label><label className="field field-wide"><span>Target countries</span><input name="countries" value={form.countries} onChange={handleChange} placeholder="United States, Canada" /></label></div></div>
        <div className="form-section"><div className="form-section-title"><span>02</span><div><h3>What does a good fit look like?</h3><p>Near-miss employee and revenue ranges now receive graded partial credit.</p></div></div><div className="form-grid"><label className="field"><span>Minimum employees</span><input name="employee_min" type="number" min="0" value={form.employee_min} onChange={handleChange} placeholder="50" /></label><label className="field"><span>Maximum employees</span><input name="employee_max" type="number" min="0" value={form.employee_max} onChange={handleChange} placeholder="500" /></label><label className="field"><span>Minimum revenue (USD)</span><input name="revenue_min" type="number" min="0" value={form.revenue_min} onChange={handleChange} placeholder="5000000" /></label><label className="field"><span>Maximum revenue (USD)</span><input name="revenue_max" type="number" min="0" value={form.revenue_max} onChange={handleChange} placeholder="100000000" /></label></div></div>
        <div className="form-section"><div className="form-section-title"><span>03</span><div><h3>What signals matter?</h3><p>One matching technology gets partial credit; multiple matches show a stronger stack fit.</p></div></div><label className="field field-wide"><span>Target technologies</span><input name="technologies" value={form.technologies} onChange={handleChange} placeholder="Salesforce, HubSpot, AWS" /></label></div>
        <div className="settings-footer"><div className="settings-note"><Info size={16} /><span>Saving updates the active profile. It does not scrape the web or modify existing lead history.</span></div>{message && <div className={`form-message ${message.type === 'success' ? 'form-success' : 'form-error'}`} role="alert">{message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{message.text}</div>}<Button type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save ICP profile'}</Button></div>
      </form>
    </div>
  );
}
