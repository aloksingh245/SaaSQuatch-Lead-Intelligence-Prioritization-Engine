import { useState, useEffect } from 'react';
import { IcpAPI } from '../lib/api';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: 'Default ICP',
    target_industries: '',
    employee_min: '',
    employee_max: '',
    revenue_min: '',
    revenue_max: '',
    countries: '',
    technologies: '',
  });

  // Load current ICP on mount
  useEffect(() => {
    loadIcp();
  }, []);

  const loadIcp = async () => {
    try {
      const data = await IcpAPI.getLatest();
      setFormData({
        name: data.name || 'Default ICP',
        target_industries: (data.target_industries || []).join(', '),
        employee_min: data.employee_min || '',
        employee_max: data.employee_max || '',
        revenue_min: data.revenue_min || '',
        revenue_max: data.revenue_max || '',
        countries: (data.countries || []).join(', '),
        technologies: (data.technologies || []).join(', '),
      });
    } catch (err) {
      if (err.response?.status !== 404) {
        setError('Failed to load ICP profile.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setSuccess(false); // hide success message when user starts typing again
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Convert comma-separated strings back to arrays
      const payload = {
        ...formData,
        employee_min: formData.employee_min ? parseInt(formData.employee_min, 10) : null,
        employee_max: formData.employee_max ? parseInt(formData.employee_max, 10) : null,
        revenue_min: formData.revenue_min ? parseInt(formData.revenue_min, 10) : null,
        revenue_max: formData.revenue_max ? parseInt(formData.revenue_max, 10) : null,
        target_industries: formData.target_industries.split(',').map(s => s.trim()).filter(Boolean),
        countries: formData.countries.split(',').map(s => s.trim()).filter(Boolean),
        technologies: formData.technologies.split(',').map(s => s.trim()).filter(Boolean),
      };

      await IcpAPI.save(payload);
      setSuccess(true);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse flex space-x-4"><div className="h-4 bg-gray-200 rounded w-1/4"></div></div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Ideal Customer Profile (ICP)</h1>
        <p className="mt-1 text-sm text-gray-500">
          Define the rules the scoring engine uses to grade leads. 
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
        <div className="px-4 py-6 sm:p-8">
          <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
            
            {/* Name */}
            <div className="sm:col-span-6">
              <label className="block text-sm font-medium leading-6 text-gray-900">Profile Name</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            {/* Target Industries */}
            <div className="sm:col-span-6">
              <label className="block text-sm font-medium leading-6 text-gray-900">Target Industries (comma-separated)</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="target_industries"
                  value={formData.target_industries}
                  onChange={handleChange}
                  placeholder="e.g. SaaS, Cloud Software, FinTech"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            {/* Employees */}
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium leading-6 text-gray-900">Min Employees</label>
              <div className="mt-2">
                <input
                  type="number"
                  name="employee_min"
                  value={formData.employee_min}
                  onChange={handleChange}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium leading-6 text-gray-900">Max Employees</label>
              <div className="mt-2">
                <input
                  type="number"
                  name="employee_max"
                  value={formData.employee_max}
                  onChange={handleChange}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            {/* Revenue */}
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium leading-6 text-gray-900">Min Revenue (USD)</label>
              <div className="mt-2">
                <input
                  type="number"
                  name="revenue_min"
                  value={formData.revenue_min}
                  onChange={handleChange}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium leading-6 text-gray-900">Max Revenue (USD)</label>
              <div className="mt-2">
                <input
                  type="number"
                  name="revenue_max"
                  value={formData.revenue_max}
                  onChange={handleChange}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            {/* Countries */}
            <div className="sm:col-span-6">
              <label className="block text-sm font-medium leading-6 text-gray-900">Target Countries (comma-separated)</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="countries"
                  value={formData.countries}
                  onChange={handleChange}
                  placeholder="e.g. United States, United Kingdom, Canada"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            {/* Technologies */}
            <div className="sm:col-span-6">
              <label className="block text-sm font-medium leading-6 text-gray-900">Target Technologies (comma-separated)</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="technologies"
                  value={formData.technologies}
                  onChange={handleChange}
                  placeholder="e.g. Salesforce, HubSpot, AWS"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer actions */}
        <div className="flex items-center justify-end gap-x-6 border-t border-gray-900/10 px-4 py-4 sm:px-8 bg-gray-50 rounded-b-xl">
          {error && (
            <div className="flex items-center text-red-600 text-sm mr-auto">
              <AlertCircle className="h-4 w-4 mr-1" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center text-green-600 text-sm mr-auto font-medium">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Profile saved successfully
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex justify-center items-center rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
