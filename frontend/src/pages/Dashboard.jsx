import { useState, useEffect } from 'react';
import { LeadsAPI } from '../lib/api';
import { Download, Filter, ChevronLeft, ChevronRight, X, Building2, Target } from 'lucide-react';

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [filters, setFilters] = useState({ priority: '', minScore: '' });

  // Modal state
  const [selectedLead, setSelectedLead] = useState(null);

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters.priority, filters.minScore]);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const data = await LeadsAPI.getLeads({ ...filters, page, limit: 15 });
      setLeads(data.data);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPage(1); // Reset to first page on filter change
  };

  const getPriorityBadge = (priority) => {
    const styles = {
      HIGH: 'bg-green-50 text-green-700 ring-green-600/20',
      MEDIUM: 'bg-blue-50 text-blue-700 ring-blue-600/20',
      LOW: 'bg-orange-50 text-orange-700 ring-orange-600/20',
      VERY_LOW: 'bg-gray-50 text-gray-600 ring-gray-500/10',
    };
    return `inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${styles[priority] || styles.VERY_LOW}`;
  };

  const openLeadDetail = async (leadId) => {
    try {
      const fullLead = await LeadsAPI.getLead(leadId);
      setSelectedLead(fullLead);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header & Actions */}
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold leading-6 text-gray-900">Pipeline</h1>
          <p className="mt-2 text-sm text-gray-500">
            A ranked list of all processed leads, prioritized by your ICP rules.
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <a
            href={LeadsAPI.getExportUrl(filters)}
            download
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2 text-gray-400" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-t-xl border border-gray-200 border-b-0 flex gap-4 items-end">
        <div className="flex items-center text-sm font-medium text-gray-700 mr-2 mb-2">
          <Filter className="h-4 w-4 mr-2" /> Filters
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
          <select
            name="priority"
            value={filters.priority}
            onChange={handleFilterChange}
            className="block w-40 rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 sm:text-sm sm:leading-6"
          >
            <option value="">All</option>
            <option value="HIGH">High (80-100)</option>
            <option value="MEDIUM">Medium (60-79)</option>
            <option value="LOW">Low (40-59)</option>
            <option value="VERY_LOW">Very Low (0-39)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Min Score</label>
          <input
            type="number"
            name="minScore"
            placeholder="0"
            value={filters.minScore}
            onChange={handleFilterChange}
            className="block w-24 rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 sm:text-sm sm:leading-6"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-gray-200 rounded-b-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Company</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Industry</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Location</th>
              <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Score</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-sm text-gray-500">Loading leads...</td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-sm text-gray-500">No leads found matching these filters.</td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  onClick={() => openLeadDetail(lead.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                    <div className="flex items-center">
                      <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="ml-4">
                        <div className="font-medium text-gray-900">{lead.company_name}</div>
                        <div className="text-gray-500 text-xs">{lead.domain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{lead.industry || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{lead.country || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 font-semibold text-right">{lead.total_score}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <span className={getPriorityBadge(lead.priority)}>{lead.priority}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="hidden sm:block">
            <p className="text-sm text-gray-700">
              Showing page <span className="font-medium">{pagination.page}</span> of <span className="font-medium">{pagination.pages}</span> ({pagination.total} total leads)
            </p>
          </div>
          <div className="flex flex-1 justify-between sm:justify-end gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages || pagination.pages === 0}
              className="relative inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* X-Ray Modal (Lead Detail & Score Explanation) */}
      {selectedLead && (
        <div className="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

          <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <div className="relative transform overflow-hidden rounded-xl bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                
                {/* Close Button */}
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    onClick={() => setSelectedLead(null)}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <h3 className="text-xl font-semibold leading-6 text-gray-900 flex items-center gap-3" id="modal-title">
                      {selectedLead.company_name}
                      <span className={getPriorityBadge(selectedLead.priority)}>{selectedLead.priority}</span>
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{selectedLead.domain}</p>

                    <div className="mt-8 border-t border-gray-200 pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-base font-semibold text-gray-900 flex items-center">
                          <Target className="h-5 w-5 mr-2 text-blue-600" />
                          Score X-Ray
                        </h4>
                        <span className="text-3xl font-bold text-gray-900">{selectedLead.total_score} <span className="text-sm font-normal text-gray-500">/ 100</span></span>
                      </div>
                      
                      {/* Score Breakdown List */}
                      <ul className="mt-4 space-y-3">
                        {selectedLead.explanation?.reasons?.map((reason, idx) => (
                          <li key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <div>
                              <span className="font-medium text-gray-900 text-sm block">{reason.factor}</span>
                              <span className="text-gray-500 text-sm">{reason.reason}</span>
                            </div>
                            <div className="text-right ml-4 flex-shrink-0">
                              <span className={`font-semibold ${reason.points > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                +{reason.points}
                              </span>
                              <span className="text-gray-400 text-xs ml-1">/ {reason.maxPoints}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
