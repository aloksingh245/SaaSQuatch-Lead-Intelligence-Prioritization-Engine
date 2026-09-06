import axios from 'axios';

/**
 * API Client — src/lib/api.js
 * 
 * This is the ONLY file that talks to the backend.
 * By keeping all network calls here, the UI components stay clean
 * and we ensure no backend endpoints are left behind.
 * 
 * Note: We don't hardcode "http://localhost:3000" because Vite's
 * proxy intercepts "/api" requests and routes them automatically.
 */

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

export const LeadsAPI = {
  // 1. Upload CSV
  importFile: async (file, icpId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('icpId', icpId);
    
    const res = await api.post('/leads/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  // 2. Poll job status
  getJobStatus: async (jobId) => {
    const res = await api.get(`/jobs/${jobId}`);
    return res.data;
  },

  // 2b. List recent import jobs
  getRecentJobs: async () => {
    const res = await api.get('/jobs');
    return res.data;
  },

  // 3. List leads (Dashboard)
  getLeads: async (params = {}) => {
    // params can include: page, limit, priority, minScore, country, etc.
    const res = await api.get('/leads', { params });
    return res.data;
  },

  // 4. Export leads
  getExportUrl: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value != null))
    ).toString();
    return `/api/leads/export?${query}`;
  },

  // 5. Get lead details + explanation
  getLead: async (id) => {
    const res = await api.get(`/leads/${id}`);
    return res.data;
  },

  // 6. Force re-score a lead
  rescoreLead: async (id, icpId) => {
    const res = await api.post(`/leads/${id}/score`, icpId ? { icpId } : {});
    return res.data;
  }
};

export const IcpAPI = {
  // 7. Get current ICP profile
  getLatest: async () => {
    const res = await api.get('/icp');
    return res.data;
  },

  // 8. Save/Update ICP profile
  save: async (icpData) => {
    const res = await api.post('/icp', icpData);
    return res.data;
  }
};
