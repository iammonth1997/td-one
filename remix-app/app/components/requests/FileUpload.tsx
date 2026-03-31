type SelectedFile = {
  name: string;
  size: number;
  type: string;
};

type FileUploadProps = {
  name: string;
  label: string;
  hint: string;
  accept: string;
  required?: boolean;
  error?: string;
  files: SelectedFile[];
  onFilesChange: (files: File[]) => void;
};

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

export function FileUpload({ name, label, hint, accept, required, error, files, onFilesChange }: FileUploadProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-[#334155]">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </label>
      <input
        name={name}
        type="file"
        accept={accept}
        multiple
        onChange={(event) => onFilesChange(Array.from(event.currentTarget.files || []))}
        className="block w-full rounded-xl border border-[#d8dee8] px-3 py-2 text-sm text-[#1b2738] file:mr-3 file:rounded-lg file:border-0 file:bg-[#eff6ff] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#1d4ed8]"
      />
      <p className="text-xs text-[#7c8ba1]">{hint}</p>
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      {files.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-[#edf1f7] bg-[#f8fafc] px-3 py-2">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 text-xs text-[#475569]">
              <span className="truncate">{file.name}</span>
              <span className="shrink-0">{formatFileSize(file.size)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
