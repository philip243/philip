import os
from flask import Flask, render_template, request, send_from_directory, jsonify
from PIL import Image
import uuid

import shutil
import zipfile

app = Flask(__name__)

# Configure upload and processed folders
UPLOAD_FOLDER = 'uploads'
PROCESSED_FOLDER = 'processed'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['PROCESSED_FOLDER'] = PROCESSED_FOLDER

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_file_size(filepath):
    """Returns file size in KB"""
    return os.path.getsize(filepath) / 1024

@app.route('/')
def index():
    return render_template('index.html')


def compress_image(filepath, batch_processed_dir, filename, quality, output_format):
    """Helper function to compress an image"""
    try:
        with Image.open(filepath) as img:
            # Determine file extension based on format
            format_extensions = {
                'WEBP': '.webp',
                'JPEG': '.jpg',
                'PNG': '.png'
            }
            
            ext = format_extensions.get(output_format, '.webp')
            filename_no_ext = os.path.splitext(filename)[0]
            processed_filename = filename_no_ext + ext
            processed_filepath = os.path.join(batch_processed_dir, processed_filename)
            
            # Convert image mode if necessary
            if output_format == 'JPEG':
                # JPEG doesn't support transparency, convert RGBA to RGB
                if img.mode in ('RGBA', 'LA', 'P'):
                    # Create white background
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                img.save(processed_filepath, 'JPEG', quality=quality, optimize=True)
                
            elif output_format == 'PNG':
                # PNG supports transparency
                if img.mode == 'P':
                    img = img.convert('RGBA')
                img.save(processed_filepath, 'PNG', optimize=True)
                
            else:  # WEBP
                # WebP supports both RGB and RGBA
                if img.mode in ('CMYK', 'P'):
                    img = img.convert('RGB')
                img.save(processed_filepath, 'WEBP', quality=quality)
            
            compressed_size = get_file_size(processed_filepath)
            
            return {
                'compressed_size': compressed_size,
                'filename': processed_filename,
                'filepath': processed_filepath
            }
    except Exception as e:
        raise e

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    # Batch ID can be provided by client; if missing, generate a UUID server‑side
    batch_id = request.form.get('batch_id') or uuid.uuid4().hex
    

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        # Create batch directories
        batch_upload_dir = os.path.join(app.config['UPLOAD_FOLDER'], batch_id)
        batch_processed_dir = os.path.join(app.config['PROCESSED_FOLDER'], batch_id)
        os.makedirs(batch_upload_dir, exist_ok=True)
        os.makedirs(batch_processed_dir, exist_ok=True)

        # Save original
        filename = file.filename
        filepath = os.path.join(batch_upload_dir, filename)
        file.save(filepath)
        
        original_size = get_file_size(filepath)
        
        # Compress image to selected format
        try:
            quality = int(request.form.get('quality', 85))
            output_format = request.form.get('format', 'webp').upper()  # WEBP, JPEG, PNG
            
            result = compress_image(filepath, batch_processed_dir, filename, quality, output_format)
            
            return jsonify({
                'original_size': original_size,
                'compressed_size': result['compressed_size'],
                'download_url': f"/download/{batch_id}/{result['filename']}",
                'filename': result['filename']
            })
                
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/recompress', methods=['POST'])
def recompress_file():
    try:
        batch_id = request.form.get('batch_id')
        filename = request.form.get('filename')
        quality = int(request.form.get('quality', 85))
        output_format = request.form.get('format', 'webp').upper()
        
        if not batch_id or not filename:
            return jsonify({'error': 'Missing batch_id or filename'}), 400
            
        batch_upload_dir = os.path.join(app.config['UPLOAD_FOLDER'], batch_id)
        batch_processed_dir = os.path.join(app.config['PROCESSED_FOLDER'], batch_id)
        filepath = os.path.join(batch_upload_dir, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Original file not found'}), 404
            
        original_size = get_file_size(filepath)
        
        result = compress_image(filepath, batch_processed_dir, filename, quality, output_format)
        
        return jsonify({
            'original_size': original_size,
            'compressed_size': result['compressed_size'],
            'download_url': f"/download/{batch_id}/{result['filename']}",
            'filename': result['filename']
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<batch_id>/<filename>')
def download_file(batch_id, filename):
    return send_from_directory(os.path.join(app.config['PROCESSED_FOLDER'], batch_id), filename, as_attachment=True)

@app.route('/download-zip/<batch_id>')
def download_zip(batch_id):
    batch_dir = os.path.join(app.config['PROCESSED_FOLDER'], batch_id)
    if not os.path.exists(batch_dir):
        return "Batch not found", 404
        
    zip_filename = f"compressed_images_{batch_id}.zip"
    zip_filepath = os.path.join(app.config['PROCESSED_FOLDER'], zip_filename)
    
    # Create zip file
    with zipfile.ZipFile(zip_filepath, 'w') as zipf:
        for root, dirs, files in os.walk(batch_dir):
            for file in files:
                if file.endswith(('.webp', '.jpg', '.png')):
                    zipf.write(os.path.join(root, file), file)
    
    return send_from_directory(app.config['PROCESSED_FOLDER'], zip_filename, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
