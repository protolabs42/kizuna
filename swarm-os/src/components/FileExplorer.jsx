import React, { useEffect, useState } from 'react';
import { Folder, File, Download, RefreshCw } from 'lucide-react';

const FileExplorer = () => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/storage');
            const data = await res.json();
            // data.files is array of entries
            setFiles(data.files || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    const downloadFile = async (filename) => {
        try {
            const res = await fetch(`/api/storage/${filename}`);
            const data = await res.json();

            // Convert base64 to blob
            const byteCharacters = atob(data.content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/octet-stream' });

            // Create link and trigger download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Download failed', e);
        }
    };

    return (
        <div className="bg-black/80 border border-cyan-500/30 rounded-lg p-6 font-mono w-full h-full flex flex-col backdrop-blur-md">
            <div className="flex justify-between items-center mb-6 border-b border-cyan-500/30 pb-3">
                <h2 className="text-cyan-400 font-bold flex items-center gap-2">
                    <Folder className="w-5 h-5" />
                    HYPERDRIVE_STORAGE
                </h2>
                <button
                    onClick={fetchFiles}
                    className="p-1 hover:bg-cyan-500/20 rounded transition text-cyan-500"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="flex-1 overflow-auto space-y-3 scroller">
                {files.length === 0 && !loading && (
                    <div className="text-cyan-500/50 text-center py-10 italic">
                        -- DRIVE EMPTY --
                    </div>
                )}

                {files.map((f, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border border-cyan-500/10 hover:bg-cyan-500/10 rounded-lg group transition">
                        <div className="flex items-center gap-3">
                            <File className="w-4 h-4 text-cyan-300" />
                            <span className="text-cyan-100 text-sm">{f.key.replace('/', '')}</span>
                        </div>
                        <div className="text-xs text-cyan-500/70 mr-4">
                            SEQ: {f.seq}
                        </div>
                        <button
                            onClick={() => downloadFile(f.key)}
                            className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            <div className="mt-2 text-xs text-cyan-500/50 border-t border-cyan-500/20 pt-2 flex justify-between">
                <span>USAGE: {files.length} FILES</span>
                <span className="animate-pulse">● ONLINE</span>
            </div>
        </div>
    );
};

export default FileExplorer;
