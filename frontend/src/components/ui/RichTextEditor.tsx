import { useMemo, useRef } from 'react';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { mediaService } from '@/services/media';
import ImageResize from 'quill-image-resize-module-react';

// Register the image resize module
Quill.register('modules/imageResize', ImageResize);

interface RichTextEditorProps {
	value: string;
	onChange: (html: string) => void;
	placeholder?: string;
	className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
	const quillRef = useRef<ReactQuill | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleImageUpload = async (file: File) => {
		try {
			const res = await mediaService.uploadFile(file);
			const url = (res.mediaFile?.file_path || res.data?.file_path || '') as string;
			const editor = quillRef.current?.getEditor();
			if (editor && url) {
				const range = editor.getSelection(true);
				editor.insertEmbed(range ? range.index : 0, 'image', url, 'user');
				editor.setSelection((range ? range.index : 0) + 1, 0);
			}
		} catch (err: any) {
			const message = err?.response?.data?.error || err?.message || 'Upload failed';
			const editor = quillRef.current?.getEditor();
			if (editor) {
				const range = editor.getSelection(true);
				editor.insertText(range ? range.index : 0, ` [Upload error: ${message}] `, 'user');
			}
		}
	};

	const onSelectLocalImage = () => {
		fileInputRef.current?.click();
	};

	const modules = useMemo(() => ({
		toolbar: {
			container: [
				[{ header: [1, 2, 3, 4, 5, 6, false] }],
				['bold', 'italic', 'underline', 'strike'],
				[{ color: [] }, { background: [] }],
				[{ script: 'sub' }, { script: 'super' }],
				[{ list: 'ordered' }, { list: 'bullet' }],
				[{ indent: '-1' }, { indent: '+1' }],
				[{ align: [] }],
				['blockquote', 'code-block'],
				['link', 'image', 'video'],
				['clean'],
			],
			handlers: {
				image: onSelectLocalImage,
			},
		},
		imageResize: {
			parchment: Quill.import('parchment'),
			modules: ['Resize', 'DisplaySize', 'Toolbar']
		},
		history: { delay: 500, maxStack: 100, userOnly: true },
	}), []);

	return (
		<div className={className}>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				style={{ display: 'none' }}
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) handleImageUpload(file);
					// reset value to allow same file re-select
					if (fileInputRef.current) fileInputRef.current.value = '';
				}}
			/>
			<ReactQuill
				ref={(instance) => (quillRef.current = instance)}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				modules={modules}
				theme="snow"
			/>
		</div>
	);
}


