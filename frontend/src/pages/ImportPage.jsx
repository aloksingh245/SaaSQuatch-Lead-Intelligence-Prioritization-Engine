import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { IcpAPI, LeadsAPI } from '../lib/api';
import { Button } from '../components/ui/Button';

export default function ImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [icp, setIcp] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    IcpAPI.getLatest().then(setIcp).catch(() => setError('Create an ICP profile before importing leads.'));
  }, []);

  useEffect(() => {
    if (!jobId || job?.status === 'done' || job?.status === 'error') return undefined;
    const interval = setInterval(async () => {
      try { setJob(await LeadsAPI.getJobStatus(jobId)); }
      catch (err) { setError(err.response?.data?.error || 'Import progress could not be loaded.'); }
    }, 800);
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const applyFile = (nextFile) => {
    if (!nextFile) return;
    setFile(nextFile); setError(null); setJobId(null); setJob(null);
  };

  const handleFileChange = (event) => applyFile(event.target.files?.[0]);
  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    applyFile(event.dataTransfer.files?.[0]);
  };

  const handleUpload = async () => {
    if (!file || !icp) return;
    setUploading(true); setError(null);
    try {
      const result = await LeadsAPI.importFile(file, icp.id);
      setJobId(result.jobId); setJob({ status: 'pending', imported: 0, duplicates: 0, failures: 0, total_rows: 0 });
    } catch (err) { setError(err.response?.data?.error || 'The file could not be uploaded.'); }
    finally { setUploading(false); }
  };

  const processed = (job?.imported || 0) + (job?.duplicates || 0) + (job?.failures || 0);
  const progress = job?.total_rows ? Math.round((processed / job.total_rows) * 100) : 0;

  return (
    <div className="flow-page">
      <div className="page-header"><div><p className="eyebrow">Data intake</p><h1>Bring in a lead list.</h1><p className="page-lede">We’ll normalize messy fields, remove duplicates, and score every usable row against your active ICP.</p></div><Link className="text-link" to="/">Back to pipeline <ArrowRight size={15} /></Link></div>

      {error && <div className="error-banner" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}

      <div className="import-layout">
        <section className="workspace-panel import-panel"><div className="panel-heading"><div><p className="eyebrow">Step 1</p><h2>Choose a source file</h2><p>CSV, XLSX, or XLS · up to 10 MB</p></div><FileSpreadsheet size={24} /></div>
          <label className={`upload-zone ${file ? 'upload-zone-selected' : ''} ${isDragging ? 'upload-zone-dragging' : ''}`} htmlFor="file-upload" onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}><span className="upload-icon"><UploadCloud size={24} /></span><strong>{file ? file.name : isDragging ? 'Release to add this list' : 'Drop a lead list here'}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : 'or choose a file from your computer'}</span><span className="button button-secondary button-small">Browse files</span><input id="file-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} /></label>
          <div className="schema-note"><strong>Best results</strong><span>Include company name, domain, industry, employees, revenue, country, email, and decision maker. The normalizer accepts common header variations.</span></div>
        </section>

        <section className="workspace-panel import-panel"><div className="panel-heading"><div><p className="eyebrow">Step 2</p><h2>Apply your ICP</h2><p>Every new record will receive a transparent score.</p></div><span className="active-dot">Active</span></div>{icp ? <div className="icp-summary"><strong>{icp.name}</strong><span>{(icp.target_industries || []).join(', ') || 'Any industry'}</span><span>{icp.employee_min || 0}–{icp.employee_max || '∞'} employees · {(icp.countries || []).join(', ') || 'Any country'}</span></div> : <div className="empty-inline">No active ICP found. <Link to="/settings">Set one up first</Link>.</div>}<Button className="import-action" type="button" disabled={!file || !icp || uploading || !!jobId} onClick={handleUpload}>{uploading ? <><Loader2 size={16} className="spin" />Uploading…</> : jobId ? <><CheckCircle2 size={16} />Import running</> : <><UploadCloud size={16} />Start import</>}</Button></section>
      </div>

      {job && <section className="workspace-panel job-panel" aria-live="polite"><div className="job-header"><div><p className="eyebrow">Processing status</p><h2>{job.status === 'done' ? 'Import complete' : job.status === 'error' ? 'Import needs attention' : 'Working through your list'}</h2></div>{job.status === 'done' ? <CheckCircle2 className="job-success" size={24} /> : <Loader2 className="job-loading spin" size={24} />}</div><div className="progress-track"><span style={{ width: `${job.status === 'done' ? 100 : progress}%` }} /></div><div className="progress-meta"><span>{job.status === 'done' ? 'All rows processed' : `${processed} of ${job.total_rows || '…'} rows processed`}</span><span>{job.elapsed_seconds != null ? `${job.elapsed_seconds}s elapsed` : 'Running in the background'}</span></div><div className="job-stats"><div><strong>{job.imported || 0}</strong><span>Imported & scored</span></div><div><strong>{job.duplicates || 0}</strong><span>Duplicates skipped</span></div><div><strong>{job.failures || 0}</strong><span>Rows needing review</span></div></div>{job.status === 'done' && <div className="job-footer"><span>New records are ranked in your pipeline.</span><Button type="button" onClick={() => navigate(`/?jobId=${jobId}`)}>View imported batch <ArrowRight size={15} /></Button></div>}</section>}
    </div>
  );
}
