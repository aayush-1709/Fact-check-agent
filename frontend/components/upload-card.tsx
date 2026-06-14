'use client';

import { useState, useRef } from 'react';
import { Upload, FileText } from 'lucide-react';

interface UploadCardProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export function UploadCard({ onFileSelect, isLoading }: UploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={isLoading ? undefined : handleClick}
        className={`relative border-2 border-dashed rounded-3xl p-14 text-center transition-all duration-300 shadow-sm ${
          isLoading
            ? 'border-border bg-muted/30 cursor-default'
            : isDragActive
            ? 'border-primary bg-primary/8 shadow-md scale-[1.01] cursor-copy'
            : 'border-border hover:border-primary/50 hover:bg-primary/3 hover:shadow-md cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileInput}
          className="hidden"
        />

        {!file ? (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 p-5 shadow-sm">
                <Upload className="w-9 h-9 text-primary" />
              </div>
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground leading-tight">
                Drag and drop your PDF here
              </p>
              <p className="text-sm text-muted-foreground mt-2 font-medium">
                or <span className="text-primary font-semibold">click to browse</span> your files
              </p>
            </div>
            <div className="flex justify-center gap-4 pt-1">
              {['PDF only', 'Results in ~30s'].map((hint) => (
                <span key={hint} className="text-xs text-muted-foreground/70 font-medium flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40 inline-block" />
                  {hint}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="rounded-2xl bg-gradient-to-br from-green-100 to-green-50 p-5">
                <FileText className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">
                {file.name}
              </p>
              <p className="text-sm text-muted-foreground mt-1 font-medium">
                {formatFileSize(file.size)} • Ready to analyze
              </p>
            </div>
            {!isLoading && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Choose a different file
              </button>
            )}
          </div>
        )}
      </div>

      {file && (
        <button
          onClick={() => {
            onFileSelect(file);
          }}
          disabled={isLoading}
          className={`w-full mt-6 py-4 px-6 rounded-2xl font-semibold text-base transition-all duration-200 shadow-sm hover:shadow-lg ${
            isLoading
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground active:scale-95'
          }`}
        >
          {isLoading ? 'Analyzing Document...' : 'Analyze Document'}
        </button>
      )}
    </div>
  );
}
