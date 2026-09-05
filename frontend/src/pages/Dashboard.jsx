import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, Building2, Check, ChevronLeft, ChevronRight, Download,
  Filter, Mail, RefreshCw, Search, Target, UserRound, X, Zap,
} from 'lucide-react';
import { LeadsAPI } from '../lib/api';
import { Button } from '../components/ui/Button';

const EMPTY_FILTERS = {
  q: '', priority: '', country: '', industry: '', minScore: '',
  hasEmail: '', hasDecisionMaker: '',
};

const priorityCopy = {
  HIGH: { label: 'High priority', className: 'status-high' },
  MEDIUM: { label: 'Worth reviewing', className: 'status-medium' },
  LOW: { label: 'Low priority', className: 'status-low' },
  VERY_LOW: { label: 'Deprioritized', className: 'status-muted' },
};

function PriorityBadge({ priority }) {
  const item = priorityCopy[priority] || priorityCopy.VERY_LOW;
  return <span className={`status-badge ${item.className}`}><span className="status-dot" />{item.label}</span>;
}

function ScoreBar({ value, tone = 'blue' }) {
  return <div className="score-meter" aria-label={`${value ?? 0} out of 100`}><span className={`score-meter-fill score-${tone}`} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div>;
}

function SkeletonRows() {
  return [...Array(5)].map((_, index) => (
    <div className="table-row skeleton-row" key={index} aria-hidden="true">
      <span className="skeleton skeleton-company" /><span className="skeleton skeleton-short" />
      <span className="skeleton skeleton-score" /><span className="skeleton skeleton-badge" />
      <span className="skeleton skeleton-short" />
    </div>
  ));
}

function DetailDialog({ lead, onClose, onRescore, rescoring }) {
  const closeRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.getElementById('lead-detail-dialog');
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog?.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus?.();
    };
  }, [onClose]);

  const reasons = lead.explanation?.reasons || [];
  const missing = [!lead.email && 'verified email', !lead.decision_maker && 'decision maker', !lead.website && 'website', !lead.linkedin_url && 'LinkedIn profile'].filter(Boolean);
  const fitScore = lead.fit_score ?? lead.fitScore ?? 0;
  const readinessScore = lead.readiness_score ?? lead.readinessScore ?? 0;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div id="lead-detail-dialog" className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="lead-detail-title" tabIndex="-1">
        <div className="dialog-header">
          <div><p className="eyebrow">Lead profile</p><h2 id="lead-detail-title">{lead.company_name || 'Unnamed company'}</h2><p className="dialog-subtitle">{lead.domain || 'No domain available'}</p></div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close lead details"><X size={18} /></button>
        </div>

        <div className="dialog-scroll">
          <div className="detail-score-grid">
            <div className="score-hero"><span className="score-label">Overall priority score</span><strong>{lead.total_score ?? 0}<small>/100</small></strong><PriorityBadge priority={lead.priority} /></div>
            <div className="score-card"><div className="score-card-title"><span>ICP fit</span><strong>{fitScore}</strong></div><ScoreBar value={fitScore} tone="green" /><p>How closely this company matches the target profile.</p></div>
            <div className="score-card"><div className="score-card-title"><span>Readiness</span><strong>{readinessScore}</strong></div><ScoreBar value={readinessScore} tone="blue" /><p>How much contact information is ready for outreach.</p></div>
          </div>

          <div className="detail-section"><div className="section-heading"><h3>Company signals</h3><span>Normalized from source data</span></div><div className="detail-facts">
            <div><span>Industry</span><strong>{lead.industry || 'Not provided'}</strong></div><div><span>Location</span><strong>{lead.country || 'Not provided'}</strong></div>
            <div><span>Employees</span><strong>{lead.employees?.toLocaleString() || 'Not provided'}</strong></div><div><span>Revenue</span><strong>{lead.revenue ? `$${Number(lead.revenue).toLocaleString()}` : 'Not provided'}</strong></div>
            <div><span>Technology</span><strong>{lead.technologies?.join(', ') || 'Not provided'}</strong></div><div><span>Decision maker</span><strong>{lead.decision_maker || 'Not identified'}</strong></div>
          </div></div>

          <div className="detail-section"><div className="section-heading"><h3>Outreach readiness</h3><span>{missing.length ? `${missing.length} missing` : 'Ready to contact'}</span></div>
            {missing.length ? <div className="missing-callout"><Zap size={16} /><span>Add {missing.join(', ')} to make this lead easier to act on.</span></div> : <div className="ready-callout"><Check size={16} /><span>This record has the key fields needed for first outreach.</span></div>}
            <div className="contact-links">{lead.email && <a href={`mailto:${lead.email}`}><Mail size={15} />{lead.email}</a>}{lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" rel="noreferrer"><ArrowUpRight size={15} />LinkedIn profile</a>}{lead.website && <a href={lead.website} target="_blank" rel="noreferrer"><ArrowUpRight size={15} />Company website</a>}</div>
          </div>

          <div className="detail-section"><div className="section-heading"><h3>Why this score?</h3><span>Transparent scoring</span></div><div className="reason-list">{reasons.map((reason) => <div className="reason-row" key={reason.factor}><div><strong>{reason.factor.replaceAll('_', ' ')}</strong><span>{reason.reason}</span></div><b className={reason.points > 0 ? 'points-positive' : 'points-zero'}>+{reason.points}<small>/{reason.maxPoints}</small></b></div>)}</div></div>
        </div>
        <div className="dialog-footer"><span className="muted-note">Scores are calculated from the active ICP.</span><Button variant="secondary" type="button" onClick={onRescore} disabled={rescoring}><RefreshCw size={15} className={rescoring ? 'spin' : ''} />{rescoring ? 'Re-scoring…' : 'Re-score lead'}</Button></div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedLead, setSelectedLead] = useState(null);
  const [rescoring, setRescoring] = useState(false);
  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  const loadLeads = async () => {
    setLoading(true); setError(null);
    try {
      const data = await LeadsAPI.getLeads({ ...filters, page, limit: 15 });
      setLeads(data.data || []); setPagination(data.pagination || { total: 0, pages: 1 }); setSummary(data.summary || null);
    } catch (err) { setError(err.response?.data?.error || 'The pipeline could not be loaded. Check the backend connection.'); }
    finally { setLoading(false); }
  };

  // Loading remote data is the intentional synchronization this effect owns.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadLeads(); }, [page, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleFilterChange = (event) => { setFilters((current) => ({ ...current, [event.target.name]: event.target.value })); setPage(1); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setPage(1); };
  const openLeadDetail = async (lead, event) => {
    event?.currentTarget?.focus();
    try { setSelectedLead(await LeadsAPI.getLead(lead.id)); }
    catch (err) { setError(err.response?.data?.error || 'Lead details could not be loaded.'); }
  };
  const rescoreLead = async () => {
    if (!selectedLead) return;
    setRescoring(true);
    try {
      const result = await LeadsAPI.rescoreLead(selectedLead.id);
      setSelectedLead((current) => ({ ...current, total_score: result.score, fit_score: result.fitScore, readiness_score: result.readinessScore, priority: result.priority, explanation: { reasons: result.reasons } }));
      await loadLeads();
    } catch (err) { setError(err.response?.data?.error || 'This lead could not be re-scored.'); }
    finally { setRescoring(false); }
  };

  return (
    <div className="dashboard-page">
      <div className="page-header"><div><p className="eyebrow">Sales workspace</p><h1>Pipeline, with a reason.</h1><p className="page-lede">Find the accounts that fit your ICP and are ready for a useful first conversation.</p></div><div className="header-actions"><a className="button button-secondary" href={LeadsAPI.getExportUrl(filters)} download><Download size={16} />Export CSV</a><Link className="button button-primary" to="/import"><Zap size={16} />Import leads</Link></div></div>

      <div className="metric-strip" aria-label="Pipeline summary"><div><span>Total pipeline</span><strong>{summary?.total ?? pagination.total ?? 0}</strong><small>processed records</small></div><div><span>High priority</span><strong>{summary?.high ?? 0}</strong><small>ICP fit + ready signals</small></div><div><span>Contactable now</span><strong>{summary?.contactable ?? 0}</strong><small>with a verified email</small></div><div className="metric-note"><Target size={18} /><span>Priorities are gated by ICP fit, so complete data cannot mask a poor match.</span></div></div>

      <section className="workspace-panel" aria-label="Lead pipeline">
        <div className="filter-toolbar"><div className="search-field"><Search size={17} /><input name="q" value={filters.q} onChange={handleFilterChange} placeholder="Search company or domain" aria-label="Search company or domain" /></div><div className="filter-field"><label htmlFor="priority">Priority</label><select id="priority" name="priority" value={filters.priority} onChange={handleFilterChange}><option value="">All priorities</option><option value="HIGH">High priority</option><option value="MEDIUM">Worth reviewing</option><option value="LOW">Low priority</option><option value="VERY_LOW">Deprioritized</option></select></div><div className="filter-field"><label htmlFor="country">Country</label><input id="country" name="country" value={filters.country} onChange={handleFilterChange} placeholder="Any country" /></div><div className="filter-field"><label htmlFor="industry">Industry</label><input id="industry" name="industry" value={filters.industry} onChange={handleFilterChange} placeholder="Any industry" /></div><div className="filter-field"><label htmlFor="minScore">Min score</label><input id="minScore" name="minScore" type="number" min="0" max="100" value={filters.minScore} onChange={handleFilterChange} placeholder="0" /></div><div className="filter-field"><label htmlFor="hasEmail">Reachability</label><select id="hasEmail" name="hasEmail" value={filters.hasEmail} onChange={handleFilterChange}><option value="">Any record</option><option value="true">Has email</option><option value="false">Missing email</option></select></div><div className="filter-field"><label htmlFor="hasDecisionMaker">Decision maker</label><select id="hasDecisionMaker" name="hasDecisionMaker" value={filters.hasDecisionMaker} onChange={handleFilterChange}><option value="">Any record</option><option value="true">Identified</option><option value="false">Missing</option></select></div>{hasFilters && <button className="clear-filter" type="button" onClick={clearFilters}><Filter size={14} />Clear filters</button>}</div>
        {error && <div className="error-banner" role="alert"><span><strong>Pipeline unavailable.</strong> {error}</span><Button variant="secondary" size="sm" type="button" onClick={loadLeads}>Try again</Button></div>}
        <div className="table-head"><span>Company</span><span>ICP fit</span><span>Readiness</span><span>Priority</span><span>Contact</span></div>
        <div className="table-body">{loading ? <SkeletonRows /> : leads.length === 0 ? <div className="empty-state"><div className="empty-icon"><Building2 size={22} /></div><h2>{hasFilters ? 'No leads match those filters' : 'Your pipeline is ready for its first import'}</h2><p>{hasFilters ? 'Try a broader search or clear the filters to see the full pipeline.' : 'Import a CSV or Excel file to normalize, score, and prioritize your first batch.'}</p>{hasFilters ? <Button variant="secondary" type="button" onClick={clearFilters}>Clear filters</Button> : <Link className="button button-primary" to="/import">Import your first file</Link>}</div> : leads.map((lead, index) => <button className="table-row lead-row" style={{ '--row-index': index }} key={lead.id} type="button" onClick={(event) => openLeadDetail(lead, event)}><span className="company-cell"><span className="company-avatar"><Building2 size={16} /></span><span><strong>{lead.company_name || 'Unnamed company'}</strong><small>{lead.domain || 'No domain'}</small></span></span><span className="score-cell"><strong>{lead.fit_score ?? 0}</strong><ScoreBar value={lead.fit_score} tone="green" /></span><span className="score-cell"><strong>{lead.readiness_score ?? 0}</strong><ScoreBar value={lead.readiness_score} tone="blue" /></span><span><PriorityBadge priority={lead.priority} /></span><span className="contact-cell">{lead.email ? <><Mail size={15} />Email ready</> : lead.decision_maker ? <><UserRound size={15} />Decision maker</> : <span className="muted-note">Needs enrichment</span>}</span></button>)}</div>
        <div className="table-footer"><span>Showing page <strong>{pagination.page || 1}</strong> of <strong>{Math.max(1, pagination.pages || 1)}</strong> · {pagination.total || 0} records</span><div className="pagination-actions"><button aria-label="Previous page" className="icon-button" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}><ChevronLeft size={17} /></button><button aria-label="Next page" className="icon-button" type="button" onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))} disabled={page >= (pagination.pages || 1)}><ChevronRight size={17} /></button></div></div>
      </section>
      {selectedLead && <DetailDialog lead={selectedLead} onClose={() => setSelectedLead(null)} onRescore={rescoreLead} rescoring={rescoring} />}
    </div>
  );
}
