import { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Trash2, 
  Upload,
  Image as ImageIcon,
  File,
  Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { mediaService } from '../../services/media';
import { MediaFile } from '../../types';

export default function MediaPage() {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');


  const fetchMediaFiles = async () => {
    try {
      setLoading(true);
      const response = await mediaService.getMediaFiles();
      setMediaFiles(response.mediaFiles || []);
    } catch (error) {
      console.error('Error fetching media files:', error);
      toast.error('Failed to fetch media files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMediaFiles();
  }, []);

  const filteredFiles = mediaFiles.filter(file =>
    file.original_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    file.alt_text?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await mediaService.uploadFile(file);
      }
      toast.success('Files uploaded successfully');
      fetchMediaFiles();
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await mediaService.deleteMediaFile(id);
      toast.success('File deleted successfully');
      fetchMediaFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isImage = (mimeType: string) => {
    return mimeType.startsWith('image/');
  };

  const getFileIcon = (mimeType: string) => {
    if (isImage(mimeType)) {
      return <ImageIcon className="h-8 w-8 text-blue-500" />;
    }
    return <File className="h-8 w-8 text-gray-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <p className="text-gray-600">Upload and manage your media files</p>
        </div>
        <div className="flex gap-3">
          <input
            type="file"
            id="file-upload"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
          <label
            htmlFor="file-upload"
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Uploading...' : 'Upload Files'}
          </label>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Media Grid */}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredFiles.map((file) => (
          <div key={file.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="aspect-square bg-gray-100 flex items-center justify-center">
              {isImage(file.mime_type) ? (
                <img
                  src={file.file_path}
                  alt={file.alt_text || file.original_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                getFileIcon(file.mime_type)
              )}
            </div>
            
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                {file.original_name}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {formatFileSize(file.file_size)}
              </p>
              
              {file.alt_text && (
                <p className="text-xs text-gray-600 mt-2 line-clamp-2">
                  {file.alt_text}
                </p>
              )}

              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-gray-500">
                  {formatDate(file.created_at)}
                </span>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(file.file_path, '_blank')}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <a
                    href={file.file_path}
                    download={file.original_name}
                    className="inline-flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(file.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredFiles.length === 0 && (
        <div className="text-center py-12">
          <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No files found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by uploading your first file.
          </p>
          <div className="mt-6">
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </label>
          </div>
        </div>
      )}
    </div>
  );
} 