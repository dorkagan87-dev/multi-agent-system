'use client';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Upload, FileText, AlertCircle, CheckCircle2, Clock, Loader2, ChevronRight } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { useContractSocket } from '../../../hooks/useContractSocket';

interface ContractListItem {
  id: string;
  filename: string;
  status: 'PENDING' | 'ANALYZING' | 'DONE' | 'FAILED';
  createdAt: string;
  analysis?: { riskScore: number; summary: string } | null;
}

const STATUS_COLORS: Record<ContractListItem['status'], string> = {
  PENDING: 'text-yellow-500',
  ANALYZING: 'text-blue-500',
  DONE: 'text-green-500',
  FAILED: 'text-red-500',
};

const STATUS_ICONS: Record<ContractListItem['status'], React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4" />,
  ANALYZING: <Loader2 className="h-4 w-4 animate-spin" />,
  DONE: <CheckCircle2 className="h-4 w-4" />,
  FAILED: <AlertCircle className="h-4 w-4" />,
};

function riskColor(score: number) {
  if (score <= 33) return 'text-green-600 bg-green-50';
  if (score <= 66) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

export default function AnalyzePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingContractId, setPendingContractId] = useState<string | null>(null);

  const { data: contracts, refetch } = useQuery<ContractListItem[]>({
    queryKey: ['contracts'],
    queryFn: () => apiClient.get('/contracts').then((r) => r.data),
  });

  const handleDone = useCallback(() => {
    if (pendingContractId) {
      router.push(`/analyze/${pendingContractId}`);
    }
  }, [pendingContractId, router]);

  useContractSocket(pendingContractId, handleDone);

  function handleFileSelect(file: File) {
    setUploadError(null);
    if (!file.name.match(/\.(pdf|docx)$/i)) {
      setUploadError('Only PDF and DOCX files are supported.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large (max 10 MB).');
      return;
    }
    setSelectedFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await apiClient.post('/contracts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { contractId } = res.data as { contractId: string };
      setPendingContractId(contractId);
      setSelectedFile(null);
      setUploading(false);
      refetch();
    } catch (err: any) {
      setUploadError(err.response?.data?.error ?? 'Upload failed. Please try again.');
      setUploading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contract Analyzer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a PDF or DOCX contract — Claude will assess risks, flag issues, and let you ask follow-up questions.
        </p>
      </div>

      {/* Upload zone */}
      <div
        className={`relative rounded-xl border-2 border-dashed transition-colors p-10 text-center cursor-pointer
          ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40'}
          ${uploading || pendingContractId ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
        />

        {pendingContractId ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="font-medium">Analyzing contract…</p>
            <p className="text-sm text-muted-foreground">Claude is reading your contract. You'll be redirected when it's ready.</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <FileText className="h-10 w-10 text-primary" />
            <p className="font-medium">{selectedFile.name}</p>
            <p className="text-sm text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleUpload(); }}
              disabled={uploading}
              className="mt-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Analyze Contract'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Drop a PDF or DOCX here</p>
            <p className="text-sm text-muted-foreground">or click to browse — max 10 MB</p>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {uploadError}
        </div>
      )}

      {/* Previous contracts */}
      {contracts && contracts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Previous Contracts</h2>
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {contracts.map((c) => (
              <Link
                key={c.id}
                href={c.status === 'DONE' ? `/analyze/${c.id}` : '#'}
                className={`flex items-center gap-4 px-5 py-4 bg-card hover:bg-muted/40 transition-colors
                  ${c.status !== 'DONE' ? 'pointer-events-none' : ''}`}
              >
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {c.analysis && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${riskColor(c.analysis.riskScore)}`}>
                    {c.analysis.riskScore}/100
                  </span>
                )}
                <span className={`flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                  {STATUS_ICONS[c.status]}
                  {c.status}
                </span>
                {c.status === 'DONE' && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
