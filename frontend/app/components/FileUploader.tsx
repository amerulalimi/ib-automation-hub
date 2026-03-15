"use client";

import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  onFileParsed: (buffer: ArrayBuffer, fileName: string, ext: string) => void;
  isProcessing: boolean;
}

export function FileUploader({ onFileParsed, isProcessing }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

      if (!["xlsx", "xls", "csv"].includes(ext)) {
        setError("Format tidak disokong. Sila muat naik fail .xlsx, .xls, atau .csv");
        return;
      }

      setUploadedFile(file.name);
      const buffer = await file.arrayBuffer();
      onFileParsed(buffer, file.name, ext);
    },
    [onFileParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleReset = () => {
    setUploadedFile(null);
    setError(null);
  };

  return (
    <div className="w-full">
      {uploadedFile ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-green-800">{uploadedFile}</p>
            <p className="text-xs text-green-600">
              {isProcessing ? "Sedang memproses..." : "Berjaya dimuat naik"}
            </p>
          </div>
          <button
            onClick={handleReset}
            className="rounded-md p-1 text-green-600 hover:bg-green-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200",
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
        >
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
              isDragging ? "bg-blue-100" : "bg-muted"
            )}
          >
            {isDragging ? (
              <Upload className="h-7 w-7 text-blue-500" />
            ) : (
              <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">
              {isDragging ? "Lepaskan fail di sini" : "Seret & lepas fail Excel"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Menyokong .xlsx, .xls, .csv
            </p>
          </div>

          <label className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Pilih Fail
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={handleChange}
            />
          </label>
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <X className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}
