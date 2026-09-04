import { useState, useEffect } from 'react';
import { LeadsAPI, IcpAPI } from '../lib/api';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, BarChart2 } from 'lucide-react';

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [icp, setIcp] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  
  // Job polling state
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);

  // Load ICP on mount (we need its ID to run the import)
  useEffect(() => {
    IcpAPI.getLatest()
      .then(data => setIcp(data))
      .catch(() => setError('No ICP profile found. Please create one in Settings first.'));
  }, []);

  // Poll job status when jobId exists
  useEffect(() => {
    let interval;
    if (jobId && job?.status !== 'done' && job?.status !== 'error') {
      interval = setInterval(async () => {
        try {
          const data = await LeadsAPI.getJobStatus(jobId);
          setJob(data);
          if (data.status === 'done' || data.status === 'error') {
            clearInterval(interval);
          }
        } catch (err) {
          console.error(err);
          clearInterval(interval);
        }
      }, 1000); // Poll every 1 second
    }
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
      // Reset job state if they select a new file
      setJobId(null);
      setJob(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!icp) {
      setError('You must configure an ICP profile first.');
      return;
    }

    setUploading(true);
    setError(null);
    
    try {
      const res = await LeadsAPI.importFile(file, icp.id);
      setJobId(res.jobId);
      setJob({ status: 'pending', imported: 0, duplicates: 0 }); // optimistic start
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Import Leads</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload a CSV or Excel file. We will normalize, deduplicate, and score it in the background.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" /> {error}
        </div>
      )}

      {/* Upload Zone */}
      <div className="bg-white p-8 border border-gray-200 border-dashed rounded-xl shadow-sm flex flex-col items-center justify-center text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
          <UploadCloud className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-gray-900">Select a CSV or Excel file</h3>
        <p className="mt-1 text-sm text-gray-500 mb-6">
          Columns should include domain, company name, industry, employees, etc.
        </p>
        
        <input
          type="file"
          accept=".csv, .xlsx, .xls"
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          <FileText className="h-4 w-4 mr-2 text-gray-400" />
          {file ? file.name : 'Browse files'}
        </label>

        {file && (
          <div className="mt-6">
            <button
              onClick={handleUpload}
              disabled={uploading || !!jobId}
              className="inline-flex items-center rounded-md bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
            >
              {uploading ? (
                <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Uploading...</>
              ) : jobId ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> File Uploaded</>
              ) : (
                'Start Import'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Progress & Results Panel */}
      {job && (
        <div className="mt-8 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center">
              {job.status === 'processing' || job.status === 'pending' ? (
                <><Loader2 className="animate-spin h-5 w-5 text-blue-600 mr-2" /> Processing Job</>
              ) : job.status === 'done' ? (
                <><CheckCircle2 className="h-5 w-5 text-green-600 mr-2" /> Import Complete</>
              ) : (
                <><AlertCircle className="h-5 w-5 text-red-600 mr-2" /> Import Failed</>
              )}
            </h3>
            {job.elapsed_seconds !== undefined && (
              <span className="text-sm text-gray-500">{job.elapsed_seconds}s elapsed</span>
            )}
          </div>
          
          <div className="px-6 py-6">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-600">Imported & Scored</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{job.imported || 0}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm font-medium text-orange-600">Duplicates Skipped</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{job.duplicates || 0}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm font-medium text-red-600">Failed Rows</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{job.failures || 0}</p>
              </div>
            </div>

            {/* Duplicate Quality Report */}
            {job.status === 'done' && job.duplicateQuality && (
              <div className="mt-8 border-t border-gray-100 pt-6">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center mb-4">
                  <BarChart2 className="h-4 w-4 mr-2 text-gray-500" /> 
                  Duplicate Quality Intelligence
                </h4>
                <p className="text-sm text-gray-500 mb-4">
                  Of the {job.duplicates} skipped leads, here is the breakdown of how they matched your database:
                </p>
                
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="overflow-hidden rounded-lg border border-gray-200 px-4 py-3">
                    <dt className="truncate text-xs font-medium text-gray-500 uppercase">Strong Match (Domain)</dt>
                    <dd className="mt-1 text-xl font-semibold text-gray-900">{job.duplicateQuality.byDomain}</dd>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200 px-4 py-3">
                    <dt className="truncate text-xs font-medium text-gray-500 uppercase">Weak Match (Name)</dt>
                    <dd className="mt-1 text-xl font-semibold text-gray-900">{job.duplicateQuality.byCompanyName}</dd>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                    <dt className="truncate text-xs font-medium text-orange-800 uppercase">Data Conflicts Found</dt>
                    <dd className="mt-1 text-xl font-semibold text-orange-900">{job.duplicateQuality.withFieldDiffs}</dd>
                    <p className="mt-1 text-xs text-orange-700">Incoming data differed from existing records.</p>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
